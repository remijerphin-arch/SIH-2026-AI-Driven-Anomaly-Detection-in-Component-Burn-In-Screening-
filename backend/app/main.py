from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import Base, SessionLocal, engine
from app.api.routes import router
from app.ml.pipeline import run_analysis
from app.services.ingest import ingest_csv_bytes, ingest_dataframe
from app.services.settings_service import get_settings_map
from app.utils.errors import http_error_handler, unhandled_error_handler


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
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
    name = file.filename.lower()
    if not any(name.endswith(ext) for ext in (".csv", ".xlsx", ".xls", ".json")):
        raise HTTPException(400, "Unsupported file type. Upload a CSV, XLSX, XLS, or JSON dataset.")
    content = await file.read()
    db = SessionLocal()
    try:
        parsed = ingest_csv_bytes(db, content, settings.max_csv_bytes, file.filename)
        return {
            "rows": parsed["rows"],
            "components": parsed["components"],
            "warnings": parsed["warnings"],
            "errors": parsed["errors"],
            "preview": parsed["preview"],
        }
    finally:
        db.close()


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "Please select a dataset file.")
    name = file.filename.lower()
    if not any(name.endswith(ext) for ext in (".csv", ".xlsx", ".xls", ".json")):
        raise HTTPException(400, "Unsupported file type. Upload a CSV, XLSX, XLS, or JSON dataset.")
    content = await file.read()
    db = SessionLocal()
    try:
        parsed = ingest_csv_bytes(db, content, settings.max_csv_bytes, file.filename)
        if parsed["errors"]:
            return {
                "rows": 0,
                "components": 0,
                "warnings": parsed["warnings"],
                "errors": parsed["errors"],
                "preview": parsed["preview"],
                "analysis": None,
            }
        ingest_dataframe(db, parsed["df"], source="upload")
        analysis = run_analysis(db)
        return {
            "rows": parsed["rows"],
            "components": parsed["components"],
            "warnings": parsed["warnings"],
            "errors": [],
            "preview": parsed["preview"],
            "analysis": analysis,
        }
    finally:
        db.close()
