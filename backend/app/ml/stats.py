from __future__ import annotations

import numpy as np


def mad(values: np.ndarray) -> float:
    med = float(np.median(values))
    return float(np.median(np.abs(values - med)))


def robust_zscore(x: float, values: np.ndarray) -> float:
    """z = (x - median) / (1.4826 * MAD), numerically safe."""
    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        return 0.0
    med = float(np.median(arr))
    scale = 1.4826 * mad(arr)
    if scale < 1e-9:
        scale = float(np.std(arr)) if arr.size > 1 else 1e-9
    if scale < 1e-9:
        return 0.0
    return float((x - med) / scale)


def clip_score(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return float(max(lo, min(hi, value)))


def linear_slope(hours: np.ndarray, values: np.ndarray) -> float:
    if hours.size < 2:
        return 0.0
    if np.allclose(hours, hours[0]):
        return 0.0
    coef = np.polyfit(hours.astype(float), values.astype(float), 1)
    return float(coef[0])


def pct_change(first: float, last: float) -> float:
    if abs(first) < 1e-12:
        return 0.0
    return float((last - first) / abs(first) * 100.0)
