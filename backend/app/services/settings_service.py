from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models.db_models import Setting

DEFAULT_SETTINGS: dict[str, Any] = {
    "specification_limits": {
        "leakage_current": 50.0,
        "voltage": 5.5,
        "current": 140.0,
        "temperature": 130.0,
        "propagation_delay": 28.0,
        "resistance": 120.0,
        "capacitance": 14.0,
    },
    "warning_threshold_pct": 0.8,
    "risk_safe_max": 30.0,
    "risk_warning_max": 60.0,
    "risk_anomaly_max": 80.0,
    "batch_method": "robust_zscore",
    "prediction_horizon": 168,
    "model_selection": "isolation_forest+random_forest",
    "refresh_interval_sec": 6,
    "theme": "mission-dark",
    "data_retention_days": 90,
    "weights": {
        "spec": 0.12,
        "lot": 0.24,
        "trend": 0.24,
        "ml": 0.22,
        "prediction": 0.18,
    },
    "active_models": {
        "anomaly": "IsolationForest",
        "statistical": "Robust Z-score (MAD)",
        "prediction": "RandomForestRegressor",
        "replaceable": ["XGBoost", "LSTM", "GRU"],
    },
}


def get_settings_map(db: Session) -> dict[str, Any]:
    rows = db.query(Setting).all()
    if not rows:
        save_settings(db, DEFAULT_SETTINGS)
        return json.loads(json.dumps(DEFAULT_SETTINGS))
    merged = json.loads(json.dumps(DEFAULT_SETTINGS))
    for row in rows:
        try:
            merged[row.key] = json.loads(row.value)
        except json.JSONDecodeError:
            merged[row.key] = row.value
    return merged


def save_settings(db: Session, data: dict[str, Any]) -> dict[str, Any]:
    current = DEFAULT_SETTINGS.copy()
    existing = {s.key: s for s in db.query(Setting).all()}
    for key, value in {**current, **data}.items():
        payload = json.dumps(value)
        if key in existing:
            existing[key].value = payload
        else:
            db.add(Setting(key=key, value=payload))
    db.commit()
    return get_settings_map(db)
