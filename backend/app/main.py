from contextlib import asynccontextmanager
import json

from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import Base, SessionLocal, engine
from app.api.routes import router
from app.ml.pipeline import run_analysis
from app.services.ingest import ingest_csv_bytes, ingest_dataframe
from app.services.csv_service import describe_uploaded_file, parse_uploaded_file
from app.services.schema_detection import json_rows
from app.models.db_models import Alert, AnomalyResult, Batch, Component, DatasetSnapshot, Measurement, ModelRun, Prediction, Report
from app.services.settings_service import get_settings_map
from app.utils.errors import http_error_handler, unhandled_error_handler


SUPPORTED_UPLOAD_SUFFIXES = (".csv", ".xlsx", ".xls", ".json", ".txt", ".zip")


def _validate_upload_name(filename: str) -> None:
    name = filename.lower()
    if not any(name.endswith(ext) for ext in SUPPORTED_UPLOAD_SUFFIXES) and "." in name:
        raise HTTPException(400, "Unsupported file type. Upload CSV, XLSX, XLS, JSON, TXT, or ZIP data.")


def _migrate_measurement_schema() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as connection:
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(measurements)")}
        for column in ("pressure", "vibration"):
            if column not in columns:
                connection.exec_driver_sql(f"ALTER TABLE measurements ADD COLUMN {column} FLOAT")


def _ingest_content(filename: str, content: bytes, source: str, clear_before: bool = False) -> dict:
    db = SessionLocal()
    try:
        parsed = describe_uploaded_file(filename, content, settings.max_csv_bytes)
        if parsed["errors"]:
            return {**parsed, "analysis": None}
        if clear_before:
            _clear_dataset_records()
        raw_df, _, _ = parse_uploaded_file(filename, content, settings.max_csv_bytes)
        snapshot = DatasetSnapshot(
            filename=filename,
            detected_format=filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt",
            schema_name=parsed["schema"]["schema"],
            mapping_json=json.dumps(parsed["schema"]["mapping"]),
            metadata_json=json.dumps(parsed["metadata"]),
            rows_json=json.dumps(json_rows(raw_df)),
        )
        db.add(snapshot)
        if parsed["schema"]["schema"] in ("AEGIS_COMPONENT_SCREENING", "C-MAPSS"):
            ingest_dataframe(db, raw_df, source=source)
        db.commit()
        return {
            "rows": parsed["rows"],
            "components": parsed["components"],
            "warnings": parsed["warnings"],
            "errors": [],
            "preview": parsed["preview"],
            "metadata": parsed["metadata"],
            "schema": parsed["schema"],
            "detected_format": snapshot.detected_format,
            "selected_file": filename,
            "analysis": None,
        }
    finally:
        db.close()


def _clear_dataset_records() -> None:
    db = SessionLocal()
    try:
        for model in (Alert, AnomalyResult, Prediction, Report, Measurement, Component, Batch, ModelRun, DatasetSnapshot):
            db.query(model).delete()
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_measurement_schema()
    db: Session = SessionLocal()
    try:
        get_settings_map(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="AEGIS Reliability Platform",
    description="AI-driven anomaly detection for aerospace reliability screening and burn-in analysis.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(HTTPException, http_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)
app.include_router(router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True, "service": settings.app_name, "data_disclaimer": "Awaiting aerospace telemetry dataset."}


@app.post("/api/upload/preview")
async def upload_preview(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "Please select a dataset file.")
    _validate_upload_name(file.filename)
    content = await file.read()
    parsed = describe_uploaded_file(file.filename, content, settings.max_csv_bytes)
    return {**parsed, "selected_file": file.filename, "detected_format": file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "txt", "analysis": None}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "Please select a dataset file.")
    _validate_upload_name(file.filename)
    content = await file.read()
    return _ingest_content(file.filename, content, "upload", clear_before=True)


@app.post("/api/demo")
def load_demo(dataset: str = Query(default="FD001", pattern=r"^FD00[1-4]$")):
    dataset_dir = settings.project_root / "Dataset"
    candidates = [dataset_dir / f"train_{dataset}.txt", dataset_dir / f"train_{dataset}"]
    dataset = next((candidate for candidate in candidates if candidate.exists()), None)
    if dataset is None:
        raise HTTPException(404, "Demo dataset is not available in the project Dataset folder.")
    _clear_dataset_records()
    result = _ingest_content(dataset.name, dataset.read_bytes(), "demo")
    if result["errors"]:
        return result
    db = SessionLocal()
    try:
        result["analysis"] = run_analysis(db)
        return result
    finally:
        db.close()


@app.delete("/api/dataset")
def clear_dataset():
    _clear_dataset_records()
    return {"cleared": True}
