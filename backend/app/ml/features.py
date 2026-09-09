from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.ml.stats import linear_slope, pct_change, robust_zscore

PARAMETERS = [
    "leakage_current",
    "voltage",
    "current",
    "temperature",
    "propagation_delay",
    "resistance",
    "capacitance",
]


@dataclass
class ComponentSeries:
    component_id: str
    batch_id: str
    hours: np.ndarray
    values: dict[str, np.ndarray]


def series_from_rows(component_id: str, batch_id: str, rows: list[dict]) -> ComponentSeries:
    rows = sorted(rows, key=lambda r: r["test_hour"])
    hours = np.array([r["test_hour"] for r in rows], dtype=float)
    values = {p: np.array([float(r[p]) for r in rows], dtype=float) for p in PARAMETERS}
    return ComponentSeries(component_id, batch_id, hours, values)


def latest(series: ComponentSeries, param: str) -> float:
    return float(series.values[param][-1])


def extract_features(
    series: ComponentSeries,
    batch_values: dict[str, np.ndarray],
    limits: dict[str, float],
) -> dict[str, float]:
    feats: dict[str, float] = {}
    hours = series.hours
    for param in PARAMETERS:
        vals = series.values[param]
        last = float(vals[-1])
        first = float(vals[0])
        batch = batch_values.get(param, np.array([last]))
        z = robust_zscore(last, batch)
        slope = linear_slope(hours, vals)
        if hours.size >= 3:
            mid = max(hours.size // 2, 1)
            early = linear_slope(hours[: mid + 1], vals[: mid + 1])
            late = linear_slope(hours[mid:], vals[mid:])
            accel = late - early
        else:
            accel = 0.0
        limit = float(limits.get(param, 1.0) or 1.0)
        feats[f"{param}_value"] = last
        feats[f"{param}_z"] = z
        feats[f"{param}_pct"] = pct_change(first, last)
        feats[f"{param}_slope"] = slope
        feats[f"{param}_accel"] = accel
        feats[f"{param}_vs_limit"] = last / limit
        feats[f"{param}_batch_median"] = float(np.median(batch))
    leak = series.values["leakage_current"]
    temp = series.values["temperature"]
    delay = series.values["propagation_delay"]
    feats["temp_leakage_product"] = float(temp[-1] * leak[-1] / 1000.0)
    feats["multivariate_stress"] = float(
        abs(robust_zscore(leak[-1], batch_values.get("leakage_current", leak)))
        + abs(robust_zscore(temp[-1], batch_values.get("temperature", temp)))
        + abs(robust_zscore(delay[-1], batch_values.get("propagation_delay", delay)))
    )
    return feats


FEATURE_ORDER = None  # filled after first extract


def feature_vector(feats: dict[str, float], order: list[str] | None = None) -> np.ndarray:
    keys = order or sorted(feats.keys())
    return np.array([float(feats.get(k, 0.0)) for k in keys], dtype=float)
