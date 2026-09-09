from __future__ import annotations

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split


def _early_vector(hours: np.ndarray, values: np.ndarray, horizon: int = 96) -> np.ndarray:
    """Use readings at or before `horizon` as prediction inputs."""
    mask = hours <= horizon
    h = hours[mask]
    v = values[mask]
    if h.size == 0:
        return np.array([values[0], values[0], 0.0, 0.0], dtype=float)
    v0 = float(v[0])
    v_last = float(v[-1])
    h_last = float(h[-1])
    slope = (v_last - v0) / max(h_last, 1.0)
    # interpolate common checkpoints if present
    checkpoints = []
    for t in (0, 24, 96):
        if np.any(np.isclose(h, t)):
            checkpoints.append(float(v[np.argmin(np.abs(h - t))]))
        else:
            checkpoints.append(float(np.interp(t, h, v, left=v0, right=v_last)))
    return np.array(checkpoints + [slope, h_last], dtype=float)


def train_regressor(
    hours_list: list[np.ndarray],
    series_list: list[np.ndarray],
    targets: list[float],
    seed: int = 42,
) -> tuple[RandomForestRegressor | None, dict]:
    if len(targets) < 12:
        return None, {"note": "Insufficient labeled 168h samples for holdout metrics."}

    X = np.vstack([_early_vector(h, s) for h, s in zip(hours_list, series_list)])
    y = np.array(targets, dtype=float)
    if len(y) < 20:
        model = RandomForestRegressor(n_estimators=180, random_state=seed, min_samples_leaf=2)
        model.fit(X, y)
        pred = model.predict(X)
        metrics = {
            "mae": float(mean_absolute_error(y, pred)),
            "rmse": float(np.sqrt(mean_squared_error(y, pred))),
            "r2": float(r2_score(y, pred)),
            "n": int(len(y)),
            "split": "fit_all_small_n",
        }
        return model, metrics

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=seed)
    model = RandomForestRegressor(
        n_estimators=220,
        random_state=seed,
        min_samples_leaf=2,
        max_depth=12,
        n_jobs=1,
    )
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    metrics = {
        "mae": float(mean_absolute_error(y_test, pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_test, pred))),
        "r2": float(r2_score(y_test, pred)),
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
        "split": "holdout_25pct",
    }
    # refit on all data for production predictions
    model.fit(X, y)
    return model, metrics


def predict_168h(
    model: RandomForestRegressor | None,
    hours: np.ndarray,
    values: np.ndarray,
    limit: float,
) -> tuple[float, float, float, float]:
    """Returns predicted, low, high, drift_per_hour."""
    if hours.size == 0:
        return 0.0, 0.0, 0.0, 0.0
    v0, vlast = float(values[0]), float(values[-1])
    hlast = float(hours[-1])
    slope = (vlast - v0) / max(hlast, 1.0)
    linear_extrap = vlast + slope * max(168.0 - hlast, 0.0)
    if model is None:
        pred = linear_extrap
    else:
        x = _early_vector(hours, values).reshape(1, -1)
        pred = float(model.predict(x)[0])
        # blend slightly with physics-like extrapolation so early hours stay sane
        pred = 0.72 * pred + 0.28 * linear_extrap
    residual = max(0.08 * abs(pred), 0.4 + abs(slope) * 8)
    lo, hi = pred - 1.64 * residual, pred + 1.64 * residual
    return float(pred), float(lo), float(hi), float(slope)


def limit_cross_probability(pred: float, hi: float, limit: float) -> float:
    """Heuristic using predicted mean and upper bound vs spec limit — not a calibrated probability."""
    if pred >= limit:
        return 0.92 if hi >= limit else 0.78
    span = max(hi - pred, 1e-6)
    z = (limit - pred) / span
    # map distance-to-limit into 0-1
    p = 1.0 / (1.0 + np.exp(1.6 * (z - 0.35)))
    return float(np.clip(p, 0.02, 0.97))
