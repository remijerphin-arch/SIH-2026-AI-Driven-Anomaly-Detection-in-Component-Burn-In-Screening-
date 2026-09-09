from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.db_models import Batch, Component, Measurement
from app.services.csv_service import parse_uploaded_file


def ingest_dataframe(db: Session, df, source: str = "upload") -> int:
    batches = {b.batch_id: b for b in db.query(Batch).all()}
    comps = {c.component_id: c for c in db.query(Component).all()}
    n = 0
    for _, row in df.iterrows():
        bid = str(row["batch_id"])
        cid = str(row["component_id"])
        if bid not in batches:
            b = Batch(batch_id=bid, manufacturer=str(row.get("manufacturer", "Uploaded")), notes="Uploaded CSV")
            db.add(b)
            db.flush()
            batches[bid] = b
        if cid not in comps:
            c = Component(
                component_id=cid,
                batch_pk=batches[bid].id,
                component_type=str(row.get("component_type", "Unknown")),
                manufacturer=str(row.get("manufacturer", "Uploaded")),
                current_test_hour=int(row["test_hour"]),
                data_source=source,
                last_updated=datetime.utcnow(),
            )
            db.add(c)
            db.flush()
            comps[cid] = c
        existing = (
            db.query(Measurement)
            .filter(Measurement.component_pk == comps[cid].id, Measurement.test_hour == int(row["test_hour"]))
            .first()
        )
        payload = dict(
            temperature=float(row["temperature"]),
            voltage=float(row["voltage"]),
            current=float(row["current"]),
            leakage_current=float(row["leakage_current"]),
            propagation_delay=float(row["propagation_delay"]),
            resistance=float(row["resistance"]),
            capacitance=float(row["capacitance"]),
        )
        if existing:
            for k, v in payload.items():
                setattr(existing, k, v)
        else:
            db.add(Measurement(component_pk=comps[cid].id, test_hour=int(row["test_hour"]), **payload))
        comps[cid].current_test_hour = max(comps[cid].current_test_hour, int(row["test_hour"]))
        n += 1
    db.commit()
    return n


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
