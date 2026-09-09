from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from app.models.db_models import AnomalyResult, Component, Prediction, Report
from app.services.risk_engine import recommendation


def build_report(db: Session, component_id: str) -> Report:
    c = (
        db.query(Component)
        .options(joinedload(Component.batch), joinedload(Component.measurements))
        .filter(Component.component_id == component_id)
        .first()
    )
    if c is None:
        raise ValueError(component_id)
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
    payload = {
        "title": "Component Screening Report",
        "data_label": "UPLOADED DATA",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "sih": "SIH26170",
        "disclaimer": "SIH prototype. Not an official ISRO operational system. Simulated or uploaded data only.",
        "component": {
            "component_id": c.component_id,
            "batch_id": c.batch.batch_id,
            "type": c.component_type,
            "manufacturer": c.manufacturer,
            "status": c.status,
            "current_test_hour": c.current_test_hour,
            "risk_score": c.risk_score,
            "anomaly_score": c.anomaly_score,
            "drift_risk": c.drift_risk,
            "predicted_168h": c.predicted_168h,
            "spec_limit": c.spec_limit,
            "confidence": c.confidence,
        },
        "history": [
            {
                "test_hour": m.test_hour,
                "leakage_current": m.leakage_current,
                "temperature": m.temperature,
                "voltage": m.voltage,
                "current": m.current,
                "propagation_delay": m.propagation_delay,
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
        },
        "explanations": json.loads(ar.explanations) if ar else [],
        "prediction": None
        if pred is None
        else {
            "predicted_168h": pred.predicted_168h,
            "range": [pred.range_low, pred.range_high],
            "probability_limit_cross": pred.probability_limit_cross,
            "drift_rate": pred.drift_rate,
        },
        "recommendation": recommendation(c.status),
    }
    report = Report(component_pk=c.id, payload=json.dumps(payload))
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
