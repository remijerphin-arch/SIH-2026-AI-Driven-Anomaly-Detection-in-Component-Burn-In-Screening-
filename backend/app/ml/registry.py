"""Pluggable model registry.

Active models are Isolation Forest (anomaly) and RandomForestRegressor (168h prediction).
Keys listed under `planned` are extension points — implement a trainer with the same
fit/predict contract and register it here without changing API routes.
"""

from sklearn.ensemble import IsolationForest, RandomForestRegressor

ACTIVE = {
    "anomaly": IsolationForest,
    "prediction": RandomForestRegressor,
    "statistical": "robust_zscore_mad",
}

PLANNED = ("XGBoost", "LSTM", "GRU")


def describe() -> dict:
    return {
        "active": {
            "anomaly": "IsolationForest",
            "prediction": "RandomForestRegressor",
            "statistical": "Robust Z-score (median / MAD)",
        },
        "planned": list(PLANNED),
        "feature_contract": [
            "raw parameter values",
            "deviation from batch median",
            "robust z-score",
            "percentage change",
            "slope",
            "recent acceleration",
            "temperature-adjusted / multivariate products",
        ],
    }
