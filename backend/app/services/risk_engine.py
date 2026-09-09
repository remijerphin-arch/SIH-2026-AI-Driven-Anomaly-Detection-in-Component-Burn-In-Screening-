from __future__ import annotations

from app.ml.stats import clip_score


def classify_status(score: float, cfg: dict) -> str:
    if score <= cfg["risk_safe_max"]:
        return "SAFE"
    if score <= cfg["risk_warning_max"]:
        return "WARNING"
    if score <= cfg["risk_anomaly_max"]:
        return "ANOMALY"
    return "REJECTED"


def combine_risk(
    spec: float,
    lot: float,
    trend: float,
    ml: float,
    pred: float,
    weights: dict[str, float],
) -> float:
    w = {
        "spec": float(weights.get("spec", 0.12)),
        "lot": float(weights.get("lot", 0.24)),
        "trend": float(weights.get("trend", 0.24)),
        "ml": float(weights.get("ml", 0.22)),
        "prediction": float(weights.get("prediction", 0.18)),
    }
    total = sum(w.values()) or 1.0
    score = (
        spec * w["spec"]
        + lot * w["lot"]
        + trend * w["trend"]
        + ml * w["ml"]
        + pred * w["prediction"]
    ) / total
    return clip_score(score)


def spec_layer(latest: dict[str, float], limits: dict[str, float]) -> tuple[float, list[str]]:
    reasons = []
    scores = []
    for k, v in latest.items():
        lim = float(limits.get(k, 0) or 0)
        if lim <= 0:
            continue
        ratio = v / lim
        scores.append(min(100.0, max(0.0, (ratio - 0.35) / 0.65 * 100.0)))
        if ratio >= 1.0:
            reasons.append(f"{k.replace('_', ' ')} is {v:.2f}, which exceeds the specification limit of {lim:.2f}.")
        elif ratio >= 0.9:
            reasons.append(f"{k.replace('_', ' ')} is at {ratio*100:.0f}% of the specification limit ({v:.2f} / {lim:.2f}).")
    score = max(scores) if scores else 0.0
    return clip_score(score), reasons


def lot_layer(z_map: dict[str, float], median_map: dict[str, float], latest: dict[str, float]) -> tuple[float, list[str]]:
    reasons = []
    absz = [abs(z) for z in z_map.values()]
    score = clip_score(max(absz, default=0.0) / 3.5 * 100.0)
    leak_z = z_map.get("leakage_current", 0.0)
    med = median_map.get("leakage_current")
    leak = latest.get("leakage_current")
    if med and leak and med > 0 and leak / med >= 1.8:
        reasons.append(
            f"Leakage current is {leak / med:.1f}× higher than the batch median ({leak:.2f} vs {med:.2f} µA)."
        )
    elif abs(leak_z) >= 2.2:
        reasons.append(
            f"Leakage current has a robust z-score of {leak_z:.1f} versus the rest of the lot."
        )
    stress = abs(z_map.get("temperature", 0)) + abs(z_map.get("leakage_current", 0)) + abs(
        z_map.get("propagation_delay", 0)
    )
    if stress >= 5.5:
        reasons.append(
            "Temperature, leakage current, and propagation delay are jointly elevated versus the batch (multivariate lot deviation)."
        )
    return score, reasons


def trend_layer(pct: float, slope: float, accel: float) -> tuple[float, list[str]]:
    reasons = []
    score = clip_score(min(100.0, abs(pct) * 0.55 + abs(slope) * 180 + max(accel, 0) * 220))
    if pct >= 80:
        reasons.append(f"Leakage current increased {pct:.0f}% from the 0-hour baseline.")
    if slope >= 0.12:
        reasons.append("Current drift rate is higher than typical components in this batch.")
    if accel > 0.08:
        reasons.append("Leakage current increased rapidly in the later burn-in interval (accelerating drift).")
    return score, reasons


def prediction_layer(pred: float, limit: float, p_cross: float) -> tuple[float, list[str]]:
    reasons = []
    ratio = pred / max(limit, 1e-6)
    score = clip_score(min(100.0, max(0.0, (ratio - 0.4) / 0.7 * 100.0) + p_cross * 25))
    if pred >= limit:
        reasons.append(
            f"Predicted 168h value ({pred:.1f}) exceeds the specification limit ({limit:.1f})."
        )
    elif pred >= 0.85 * limit:
        reasons.append(
            f"Predicted 168h value ({pred:.1f}) is close to the specification limit ({limit:.1f})."
        )
    if p_cross >= 0.55:
        reasons.append(f"Model-estimated chance of limit crossing by 168h is {p_cross*100:.0f}%.")
    return score, reasons


def recommendation(status: str) -> str:
    return {
        "SAFE": "Continue burn-in screening. No intervention required.",
        "WARNING": "Increase sampling frequency and review lot statistics.",
        "ANOMALY": "Manual inspection / extended burn-in recommended.",
        "REJECTED": "Manual inspection / Reject - do not release for flight screening without engineering review.",
    }[status]


def drift_label(slope: float, trend_score: float) -> str:
    if trend_score >= 75 or slope >= 0.18:
        return "HIGH"
    if trend_score >= 40 or slope >= 0.07:
        return "MEDIUM"
    return "LOW"
