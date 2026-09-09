import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database.session import get_db
from app.ml.pipeline import run_analysis, tick_live_readings
from app.models.db_models import Alert, AnomalyResult, Batch, Component, ModelRun, Prediction, Report
from app.models.schemas import PredictRequest, SettingsUpdate
from app.services.risk_engine import recommendation
from app.services.analytics import analytics_payload, dashboard_payload, distribution_and_drift
from app.services.reports import build_report
from app.services.settings_service import get_settings_map, save_settings

router = APIRouter()


def _summary(c: Component) -> dict:
    return {
        "component_id": c.component_id,
        "batch_id": c.batch.batch_id if c.batch else "",
        "component_type": c.component_type,
        "manufacturer": c.manufacturer,
        "current_test_hour": c.current_test_hour,
        "status": c.status,
        "anomaly_score": c.anomaly_score,
        "risk_score": c.risk_score,
        "drift_risk": c.drift_risk,
        "predicted_168h": c.predicted_168h,
        "spec_limit": c.spec_limit,
        "confidence": c.confidence,
        "last_updated": c.last_updated.isoformat() + "Z",
        "data_source": c.data_source,
        "category": c.category,
    }


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    base = dashboard_payload(db)
    charts = distribution_and_drift(db)
    alerts = (
        db.query(Alert)
        .options(joinedload(Alert.component))
        .order_by(Alert.created_at.desc())
        .limit(12)
        .all()
    )
    return {
        **base,
        **charts,
        "alerts": [
            {
                "id": a.id,
                "component_id": a.component.component_id,
                "severity": a.severity,
                "reason": a.reason,
                "recommended_action": a.recommended_action,
                "created_at": a.created_at.isoformat() + "Z",
            }
            for a in alerts
        ],
    }


@router.get("/components")
def list_components(
    q: str | None = None,
    status: str | None = None,
    batch: str | None = None,
    component_type: str | None = None,
    risk: str | None = None,
    progress: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Component).options(joinedload(Component.batch))
    if status:
        query = query.filter(Component.status == status.upper())
    if component_type:
        query = query.filter(Component.component_type == component_type)
    if risk:
        query = query.filter(Component.drift_risk == risk.upper())
    if progress == "complete":
        query = query.filter(Component.current_test_hour >= 168)
    elif progress == "in_progress":
        query = query.filter(Component.current_test_hour < 168)
    rows = query.all()
    if batch:
        rows = [c for c in rows if c.batch and c.batch.batch_id == batch]
    if q:
        ql = q.lower()
        rows = [
            c
            for c in rows
            if ql in c.component_id.lower() or (c.batch and ql in c.batch.batch_id.lower())
        ]
    types = sorted({c.component_type for c in db.query(Component).all()})
    batches = sorted({b.batch_id for b in db.query(Batch).all()})
    return {"items": [_summary(c) for c in rows], "types": types, "batches": batches}


@router.get("/components/{component_id}")
def component_detail(component_id: str, db: Session = Depends(get_db)):
    c = (
        db.query(Component)
        .options(joinedload(Component.batch), joinedload(Component.measurements))
        .filter(Component.component_id == component_id)
        .first()
    )
    if not c:
        raise HTTPException(404, f"Component {component_id} not found.")
    ar = (
        db.query(AnomalyResult)
        .filter(AnomalyResult.component_pk == c.id)
        .order_by(AnomalyResult.created_at.desc())
        .first()
    )
    pred = (
        db.query(Prediction)
        .filter(Prediction.component_pk == c.id)
        .order_by(Prediction.created_at.desc())
        .first()
    )
    lot_ids = [x.id for x in db.query(Component).filter(Component.batch_pk == c.batch_pk).all()]
    from app.ml.features import PARAMETERS
    from app.models.db_models import Measurement as M

    batch_avg: dict[int, dict[str, float]] = {}
    for hour in {m.test_hour for m in c.measurements}:
        rec: dict[str, float] = {}
        rows = db.query(M).filter(M.component_pk.in_(lot_ids), M.test_hour == hour).all()
        if not rows:
            continue
        for p in PARAMETERS:
            rec[p] = float(sum(getattr(r, p) for r in rows) / len(rows))
        batch_avg[hour] = rec
    cfg = get_settings_map(db)
    return {
        "summary": _summary(c),
        "measurements": [
            {
                "test_hour": m.test_hour,
                "timestamp": m.timestamp.isoformat() + "Z",
                "temperature": m.temperature,
                "voltage": m.voltage,
                "current": m.current,
                "leakage_current": m.leakage_current,
                "propagation_delay": m.propagation_delay,
                "resistance": m.resistance,
                "capacitance": m.capacitance,
                "batch_avg_leakage": (batch_avg.get(m.test_hour) or {}).get("leakage_current"),
                "batch_avg": batch_avg.get(m.test_hour, {}),
            }
            for m in sorted(c.measurements, key=lambda x: x.test_hour)
        ],
        "layers": None
        if ar is None
        else {
            "specification": ar.spec_score,
            "lot_relative": ar.lot_score,
            "trend": ar.trend_score,
            "ml_anomaly": ar.ml_score,
            "prediction": ar.prediction_score,
            "final_risk": ar.final_risk_score,
            "status": ar.status,
            "explanations": json.loads(ar.explanations),
        },
        "prediction": None
        if pred is None
        else {
            "predicted_168h": pred.predicted_168h,
            "range_low": pred.range_low,
            "range_high": pred.range_high,
            "drift_rate": pred.drift_rate,
            "probability_limit_cross": pred.probability_limit_cross,
            "parameter": pred.parameter,
        },
        "limits": cfg["specification_limits"],
        "warning_threshold_pct": cfg["warning_threshold_pct"],
        "recommendation": recommendation(c.status),
        "data_label": "UPLOADED DATA",
    }


@router.get("/alerts")
def alerts(db: Session = Depends(get_db)):
    rows = db.query(Alert).options(joinedload(Alert.component)).order_by(Alert.created_at.desc()).limit(80).all()
    return {
        "items": [
            {
                "id": a.id,
                "component_id": a.component.component_id,
                "severity": a.severity,
                "reason": a.reason,
                "recommended_action": a.recommended_action,
                "created_at": a.created_at.isoformat() + "Z",
            }
            for a in rows
        ]
    }


@router.get("/batches")
def batches(db: Session = Depends(get_db)):
    rows = db.query(Batch).options(joinedload(Batch.components)).all()
    return {
        "items": [
            {
                "batch_id": b.batch_id,
                "manufacturer": b.manufacturer,
                "notes": b.notes,
                "component_count": len(b.components),
            }
            for b in rows
        ]
    }


@router.post("/analyze")
def analyze(db: Session = Depends(get_db)):
    return run_analysis(db)


@router.post("/predict")
def predict(body: PredictRequest, db: Session = Depends(get_db)):
    c = db.query(Component).filter(Component.component_id == body.component_id).first()
    if not c:
        raise HTTPException(404, f"Component {body.component_id} not found.")
    # re-run is expensive; return stored prediction plus detail
    detail = component_detail(body.component_id, db)
    return {"component_id": body.component_id, "parameter": body.parameter, **detail}


@router.get("/analytics")
def analytics(db: Session = Depends(get_db)):
    return analytics_payload(db)


@router.get("/burn-in")
def burn_in(live: bool = Query(default=False), db: Session = Depends(get_db)):
    comps = (
        db.query(Component)
        .options(joinedload(Component.measurements), joinedload(Component.batch))
        .filter(Component.current_test_hour < 168)
        .all()
    )
    items = []
    for c in comps:
        last = max(c.measurements, key=lambda m: m.test_hour) if c.measurements else None
        items.append(
            {
                **_summary(c),
                "temperature": last.temperature if last else None,
                "voltage": last.voltage if last else None,
                "leakage_current": last.leakage_current if last else None,
            }
        )
    return {"items": items, "checkpoints": [0, 24, 96, 168]}


@router.get("/settings")
def read_settings(db: Session = Depends(get_db)):
    cfg = get_settings_map(db)
    run = db.query(ModelRun).order_by(ModelRun.created_at.desc()).first()
    return {
        **cfg,
        "latest_model_run": None
        if run is None
        else {
            "model_type": run.model_type,
            "notes": run.notes,
            "metrics": json.loads(run.metrics_json),
            "sample_count": run.sample_count,
            "created_at": run.created_at.isoformat() + "Z",
        },
    }


@router.put("/settings")
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db)):
    current = get_settings_map(db)
    data = body.model_dump(exclude_none=True)
    current.update(data)
    saved = save_settings(db, current)
    analyzed = 0
    if db.query(Component).count():
        analyzed = run_analysis(db).get("analyzed", 0)
    return {**saved, "reanalyzed": analyzed}


@router.post("/reports/{component_id}")
def create_report(component_id: str, db: Session = Depends(get_db)):
    try:
        report = build_report(db, component_id)
    except ValueError:
        raise HTTPException(404, f"Component {component_id} not found.")
    return {"id": report.id, "payload": json.loads(report.payload)}


@router.get("/reports/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)):
    r = db.query(Report).filter(Report.id == report_id).first()
    if not r:
        raise HTTPException(404, "Report not found.")
    return {"id": r.id, "payload": json.loads(r.payload)}


@router.get("/export")
def export_results(db: Session = Depends(get_db)):
    rows = db.query(Component).options(joinedload(Component.batch)).all()
    return {
        "items": [
            {
                **_summary(c),
                "recommendation": recommendation(c.status),
            }
            for c in rows
        ]
    }


@router.get("/reports")
def list_reports(db: Session = Depends(get_db)):
    rows = db.query(Report).options(joinedload(Report.component)).order_by(Report.created_at.desc()).limit(40).all()
    return {
        "items": [
            {
                "id": r.id,
                "component_id": r.component.component_id,
                "created_at": r.created_at.isoformat() + "Z",
            }
            for r in rows
        ]
    }
