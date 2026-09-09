from __future__ import annotations

import json
from collections import defaultdict

import numpy as np
from sqlalchemy.orm import Session, joinedload

from app.ml.features import PARAMETERS
from app.models.db_models import Component, Measurement
from app.services.settings_service import get_settings_map


def dashboard_payload(db: Session) -> dict:
    comps = db.query(Component).all()
    n = len(comps)
    counts = {s: 0 for s in ("SAFE", "WARNING", "ANOMALY", "REJECTED")}
    for c in comps:
        counts[c.status] = counts.get(c.status, 0) + 1
    high_risk = sum(1 for c in comps if c.risk_score >= 81)
    avg_anom = float(np.mean([c.anomaly_score for c in comps])) if comps else 0.0
    predicted_fail = sum(
        1 for c in comps if c.predicted_168h is not None and c.predicted_168h >= 0.9 * c.spec_limit
    )
    label = "NO DATASET LOADED"
    if comps:
        label = "DEMO DATASET — NASA C-MAPSS" if any(c.data_source == "demo" for c in comps) else "UPLOADED DATA"
    return {
        "data_label": label,
        "totals": {
            "tested": n,
            "safe": counts["SAFE"],
            "warning": counts["WARNING"],
            "anomaly": counts["ANOMALY"],
            "rejected": counts["REJECTED"],
            "high_risk": high_risk,
            "average_anomaly_score": round(avg_anom, 3),
            "predicted_failures": predicted_fail,
        },
        "status_chart": [{"name": k, "value": v} for k, v in counts.items()],
    }


def analytics_payload(db: Session) -> dict:
    comps = db.query(Component).options(joinedload(Component.batch), joinedload(Component.measurements)).all()
    if not comps:
        return {"empty": True}
    by_batch: dict[str, dict] = defaultdict(lambda: {"anomaly": 0, "total": 0, "drift": []})
    by_type: dict[str, list[float]] = defaultdict(list)
    by_param_flags = {p: 0 for p in PARAMETERS}
    cfg = get_settings_map(db)
    limits = cfg["specification_limits"]

    risk_hist = [0] * 5
    pred_err = []
    for c in comps:
        bid = c.batch.batch_id if c.batch else "UNKNOWN"
        by_batch[bid]["total"] += 1
        if c.status in ("ANOMALY", "REJECTED"):
            by_batch[bid]["anomaly"] += 1
        by_type[c.component_type].append(c.risk_score)
        if c.measurements:
            ms = sorted(c.measurements, key=lambda m: m.test_hour)
            drift = ms[-1].leakage_current - ms[0].leakage_current
            by_batch[bid]["drift"].append(drift)
            for p in PARAMETERS:
                last = getattr(ms[-1], p)
                if last >= 0.85 * float(limits.get(p, 1e9)):
                    by_param_flags[p] += 1
            if c.predicted_168h is not None and ms[-1].test_hour >= 168:
                pred_err.append(abs(c.predicted_168h - ms[-1].leakage_current))
        bucket = min(4, int(c.risk_score // 20))
        risk_hist[bucket] += 1

    batch_rows = []
    for bid, v in by_batch.items():
        batch_rows.append(
            {
                "batch_id": bid,
                "anomalies": v["anomaly"],
                "total": v["total"],
                "rate": round(v["anomaly"] / max(v["total"], 1), 3),
                "avg_drift": round(float(np.mean(v["drift"])) if v["drift"] else 0, 3),
            }
        )
    best = min(batch_rows, key=lambda r: (r["rate"], -r["total"])) if batch_rows else None
    type_avg = {t: float(np.mean(v)) for t, v in by_type.items()}
    highest_type = max(type_avg, key=type_avg.get) if type_avg else None
    most_param = max(by_param_flags, key=by_param_flags.get) if by_param_flags else None

    # correlation on latest measurements
    latest = []
    for c in comps:
        if not c.measurements:
            continue
        m = max(c.measurements, key=lambda x: x.test_hour)
        latest.append([getattr(m, p) for p in PARAMETERS])
    corr = []
    if len(latest) >= 8:
        arr = np.array(latest, dtype=float)
        cm = np.corrcoef(arr, rowvar=False)
        for i, a in enumerate(PARAMETERS):
            row = {"parameter": a}
            for j, b in enumerate(PARAMETERS):
                row[b] = round(float(cm[i, j]), 3)
            corr.append(row)

    avg_drift = float(np.mean([np.mean(v["drift"]) for v in by_batch.values() if v["drift"]] or [0]))
    return {
        "empty": False,
        "kpis": {
            "best_batch": best["batch_id"] if best else None,
            "most_anomalous_parameter": most_param,
            "highest_risk_type": highest_type,
            "average_drift": round(avg_drift, 3),
            "average_prediction_error": round(float(np.mean(pred_err)), 3) if pred_err else None,
            "prediction_error_n": len(pred_err),
        },
        "anomalies_by_batch": batch_rows,
        "anomalies_by_parameter": [{"parameter": k, "near_limit_count": v} for k, v in by_param_flags.items()],
        "risk_distribution": [
            {"bucket": label, "count": n}
            for label, n in zip(["0-20", "20-40", "40-60", "60-80", "80-100"], risk_hist)
        ],
        "drift_by_type": [{"type": t, "avg_risk": round(v, 2)} for t, v in type_avg.items()],
        "correlation": corr,
        "batch_comparison": batch_rows,
    }


def distribution_and_drift(db: Session) -> dict:
    comps = db.query(Component).options(joinedload(Component.measurements)).all()
    scores = [c.anomaly_score for c in comps]
    bins = [0, 0.2, 0.4, 0.6, 0.8, 1.01]
    labels = ["0-0.2", "0.2-0.4", "0.4-0.6", "0.6-0.8", "0.8-1.0"]
    hist = [0] * 5
    for s in scores:
        for i in range(5):
            if bins[i] <= s < bins[i + 1]:
                hist[i] += 1
                break
    progress = defaultdict(int)
    for c in comps:
        progress[c.current_test_hour] += 1
    hours = [0, 24, 48, 72, 96, 120, 144, 168]
    drift_series = []
    for h in hours:
        vals = []
        for c in comps:
            for m in c.measurements:
                if m.test_hour == h:
                    vals.append(m.leakage_current)
        if vals:
            drift_series.append({"hour": h, "avg_leakage": round(float(np.mean(vals)), 3)})
    pred_vs = []
    for c in comps[:180]:
        if c.predicted_168h is None:
            continue
        actual = None
        for m in c.measurements:
            if m.test_hour >= 168:
                actual = m.leakage_current
        pred_vs.append(
            {
                "component_id": c.component_id,
                "predicted": c.predicted_168h,
                "actual": actual,
            }
        )
    return {
        "anomaly_histogram": [{"bucket": l, "count": c} for l, c in zip(labels, hist)],
        "burnin_progress": [{"hour": k, "count": v} for k, v in sorted(progress.items())],
        "avg_drift": drift_series,
        "predicted_vs_actual": pred_vs,
    }
