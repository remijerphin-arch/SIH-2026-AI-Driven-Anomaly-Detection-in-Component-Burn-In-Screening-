from __future__ import annotations

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler


def fit_isolation_forest(X: np.ndarray, contamination: float = 0.12, seed: int = 42) -> tuple[IsolationForest, RobustScaler]:
    scaler = RobustScaler()
    Xs = scaler.fit_transform(X)
    model = IsolationForest(
        n_estimators=220,
        contamination=min(max(contamination, 0.02), 0.4),
        random_state=seed,
        n_jobs=1,
    )
    model.fit(Xs)
    return model, scaler


def anomaly_scores_0_100(model: IsolationForest, scaler: RobustScaler, X: np.ndarray) -> np.ndarray:
    Xs = scaler.transform(X)
    raw = -model.decision_function(Xs)
    lo, hi = np.percentile(raw, 5), np.percentile(raw, 95)
    if hi - lo < 1e-9:
        return np.zeros(len(raw))
    scaled = (raw - lo) / (hi - lo)
    return np.clip(scaled, 0, 1) * 100.0
