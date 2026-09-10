from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.db_models import Batch, Component, Measurement
from app.services.csv_service import parse_uploaded_file


def ingest_dataframe(db: Session, df, source: str = "upload") -> int:
    batches = {b.batch_id: b for b in db.query(Batch).all()}
    comps = {c.component_id: c for c in db.query(Component).all()}
    batch_rows = df.assign(batch_id=df["batch_id"].astype(str)).drop_duplicates("batch_id")
    for row in batch_rows.itertuples(index=False):
        bid = str(row.batch_id)
        if bid in batches:
            continue
        batch = Batch(batch_id=bid, manufacturer=str(getattr(row, "manufacturer", "Uploaded")), notes="Uploaded CSV")
        db.add(batch)
        db.flush()
        batches[bid] = batch

    component_rows = df.assign(component_id=df["component_id"].astype(str)).drop_duplicates("component_id")
    for row in component_rows.itertuples(index=False):
        cid = str(row.component_id)
        if cid in comps:
            continue
        component = Component(
            component_id=cid,
            batch_pk=batches[str(row.batch_id)].id,
            component_type=str(getattr(row, "component_type", "Unknown")),
            manufacturer=str(getattr(row, "manufacturer", "Uploaded")),
            current_test_hour=int(row.test_hour),
            data_source=source,
            last_updated=datetime.utcnow(),
        )
        db.add(component)
        db.flush()
        comps[cid] = component

    measurements = []
    for row in df.itertuples(index=False):
        component = comps[str(row.component_id)]
        test_hour = int(row.test_hour)
        component.current_test_hour = max(component.current_test_hour, test_hour)
        measurements.append({
            "component_pk": component.id,
            "test_hour": test_hour,
            "temperature": float(row.temperature),
            "voltage": float(row.voltage),
            "current": float(row.current),
            "pressure": float(row.pressure),
            "vibration": float(row.vibration),
            "leakage_current": float(row.leakage_current),
            "propagation_delay": float(row.propagation_delay),
            "resistance": float(row.resistance),
            "capacitance": float(row.capacitance),
        })
    if measurements:
        db.bulk_insert_mappings(Measurement, measurements)
    db.commit()
    return len(measurements)


def ingest_csv_bytes(db: Session, content: bytes, max_bytes: int, filename: str = "dataset.csv"):
    df, warnings, errors = parse_uploaded_file(filename, content, max_bytes)
    preview = []
    if not df.empty:
        preview = df.head(12).to_dict(orient="records")
        for p in preview:
            for k, v in list(p.items()):
                if hasattr(v, "item"):
                    p[k] = v.item()
    if errors:
        return {"rows": 0, "components": 0, "warnings": warnings, "errors": errors, "preview": preview, "df": None}
    return {
        "rows": int(len(df)),
        "components": int(df["component_id"].nunique()),
        "warnings": warnings,
        "errors": errors,
        "preview": preview,
        "df": df,
    }
