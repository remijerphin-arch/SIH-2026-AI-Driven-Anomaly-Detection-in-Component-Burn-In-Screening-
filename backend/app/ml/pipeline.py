from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime

import numpy as np
from sqlalchemy.orm import Session, joinedload

from app.ml.anomaly import anomaly_scores_0_100, fit_isolation_forest
from app.ml.features import PARAMETERS, extract_features, feature_vector, series_from_rows
from app.ml.prediction import limit_cross_probability, predict_168h, train_regressor
from app.ml.stats import robust_zscore
from app.models.db_models import Alert, AnomalyResult, Component, Measurement, ModelRun, Prediction
from app.services.risk_engine import (
    classify_status,
    combine_risk,
    drift_label,
    lot_layer,
    prediction_layer,
    recommendation,
    spec_layer,
    trend_layer,
)
from app.services.settings_service import get_settings_map


def _rows_for_component(comp: Component) -> list[dict]:
    out = []
    for m in sorted(comp.measurements, key=lambda x: x.test_hour):
        out.append(
            {
                "test_hour": m.test_hour,
                "temperature": m.temperature,
                "voltage": m.voltage,
                "current": m.current,
                "leakage_current": m.leakage_current,
                "propagation_delay": m.propagation_delay,
                "resistance": m.resistance,
                "capacitance": m.capacitance,
            }
        )
    return out


def run_analysis(db: Session) -> dict:
    cfg = get_settings_map(db)
    limits: dict = cfg["specification_limits"]
    weights: dict = cfg["weights"]

    comps = (
        db.query(Component)
        .options(joinedload(Component.measurements), joinedload(Component.batch))
        .all()
    )
    if not comps:
        return {"analyzed": 0, "message": "No components in database."}

    series_map = {}
    batch_param_values: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for c in comps:
        rows = _rows_for_component(c)
        if not rows:
            continue
        s = series_from_rows(c.component_id, c.batch.batch_id, rows)
        series_map[c.id] = s
        for p in PARAMETERS:
            batch_param_values[c.batch.batch_id][p].append(float(s.values[p][-1]))

    feature_dicts = {}
    order: list[str] | None = None
    X_list = []
    comp_ids_order = []
    for c in comps:
        s = series_map.get(c.id)
        if s is None:
            continue
        bvals = {p: np.array(batch_param_values[c.batch.batch_id][p], dtype=float) for p in PARAMETERS}
        feats = extract_features(s, bvals, limits)
        if order is None:
            order = sorted(feats.keys())
        feature_dicts[c.id] = feats
        X_list.append(feature_vector(feats, order))
        comp_ids_order.append(c.id)

    X = np.vstack(X_list)
    contamination = min(0.35, max(0.05, sum(1 for c in comps if c.category in ("SUSPICIOUS", "FAILING")) / max(len(comps), 1)))
    iforest, scaler = fit_isolation_forest(X, contamination=contamination)
    ml_scores = anomaly_scores_0_100(iforest, scaler, X)
    ml_by_id = {cid: float(sc) for cid, sc in zip(comp_ids_order, ml_scores)}

    # Train leakage predictor on components that reached 168h
    hours_list, series_list, targets = [], [], []
    for c in comps:
        s = series_map.get(c.id)
        if s is None:
            continue
        if 168 in s.hours.astype(int) or (s.hours.size and s.hours[-1] >= 168):
            idx = int(np.argmin(np.abs(s.hours - 168)))
            hours_list.append(s.hours)
            series_list.append(s.values["leakage_current"])
            targets.append(float(s.values["leakage_current"][idx]))
    model, metrics = train_regressor(hours_list, series_list, targets)

    db.query(AnomalyResult).delete()
    db.query(Prediction).delete()
    db.query(Alert).delete()

    predicted_failures = 0
    for c in comps:
        s = series_map.get(c.id)
        if s is None:
            continue
        feats = feature_dicts[c.id]
        latest = {p: float(s.values[p][-1]) for p in PARAMETERS}
        bvals = {p: np.array(batch_param_values[c.batch.batch_id][p], dtype=float) for p in PARAMETERS}
        z_map = {p: robust_zscore(latest[p], bvals[p]) for p in PARAMETERS}
        med_map = {p: float(np.median(bvals[p])) for p in PARAMETERS}

        spec_s, spec_r = spec_layer(latest, limits)
        lot_s, lot_r = lot_layer(z_map, med_map, latest)
        trend_s, trend_r = trend_layer(feats["leakage_current_pct"], feats["leakage_current_slope"], feats["leakage_current_accel"])

        pred, lo, hi, slope = predict_168h(model, s.hours, s.values["leakage_current"], float(limits["leakage_current"]))
        p_cross = limit_cross_probability(pred, hi, float(limits["leakage_current"]))
        pred_s, pred_r = prediction_layer(pred, float(limits["leakage_current"]), p_cross)
        ml_s = ml_by_id.get(c.id, 0.0)
        if ml_s >= 70:
            ml_reason = [
                "Isolation Forest detected a strong multivariate anomaly across leakage, temperature, delay, and lot-relative features."
            ]
        elif ml_s >= 45:
            ml_reason = ["Isolation Forest scored this unit as moderately unusual versus the screened population."]
        else:
            ml_reason = []

        final = combine_risk(spec_s, lot_s, trend_s, ml_s, pred_s, weights)
        status = classify_status(final, cfg)
        explanations = spec_r + lot_r + trend_r + ml_reason + pred_r
        if not explanations and status == "SAFE":
            explanations = [
                "Readings remain consistent with the lot median and do not show accelerating drift.",
                "Predicted 168h leakage stays well below the specification limit under the current model.",
            ]

        conf = float(np.clip(0.55 + min(s.hours.size, 8) * 0.05 + (0.08 if model is not None else 0), 0.55, 0.96))
        if s.hours[-1] < 48:
            conf = min(conf, 0.62)

        c.status = status
        c.anomaly_score = round(ml_s / 100.0, 4)
        c.risk_score = round(final, 2)
        c.drift_risk = drift_label(slope, trend_s)
        c.predicted_168h = round(pred, 3)
        c.spec_limit = float(limits["leakage_current"])
        c.confidence = round(conf * 100, 1)
        c.current_test_hour = int(s.hours[-1])
        c.last_updated = datetime.utcnow()

        db.add(
            AnomalyResult(
                component_pk=c.id,
                spec_score=round(spec_s, 2),
                lot_score=round(lot_s, 2),
                trend_score=round(trend_s, 2),
                ml_score=round(ml_s, 2),
                prediction_score=round(pred_s, 2),
                final_risk_score=round(final, 2),
                status=status,
                explanations=json.dumps(explanations),
                feature_json=json.dumps({k: round(float(v), 4) for k, v in feats.items()}),
            )
        )
        db.add(
            Prediction(
                component_pk=c.id,
                parameter="leakage_current",
                predicted_168h=round(pred, 3),
                range_low=round(lo, 3),
                range_high=round(hi, 3),
                drift_rate=round(slope, 5),
                probability_limit_cross=round(p_cross, 4),
            )
        )

        if p_cross >= 0.5 or pred >= 0.9 * float(limits["leakage_current"]):
            predicted_failures += 1

        rec = recommendation(status)
        alerts: list[tuple[str, str]] = []
        if latest["leakage_current"] >= float(limits["leakage_current"]):
            alerts.append(("CRITICAL", "Component exceeds the leakage-current specification limit."))
        elif status == "REJECTED":
            alerts.append(("CRITICAL", explanations[0] if explanations else "High composite risk score."))
        elif status == "ANOMALY":
            alerts.append(("HIGH", explanations[0] if explanations else "Multivariate anomaly detected."))
        elif status == "WARNING":
            alerts.append(("MEDIUM", explanations[0] if explanations else "Elevated drift versus lot."))
        if c.drift_risk == "HIGH" and status in ("WARNING", "ANOMALY", "REJECTED"):
            alerts.append(("HIGH", "High leakage-current drift rate during burn-in."))
        if p_cross >= 0.7:
            alerts.append(("HIGH", "Predicted limit crossing before 168 hours."))
        for sev, reason in alerts[:2]:
            db.add(
                Alert(
                    component_pk=c.id,
                    severity=sev,
                    reason=reason,
                    recommended_action=rec,
                )
            )

    db.add(
        ModelRun(
            model_type="IsolationForest+RandomForestRegressor",
            notes="Metrics computed from the uploaded aerospace dataset.",
            metrics_json=json.dumps(metrics),
            sample_count=len(comps),
        )
    )
    db.commit()
    return {
        "analyzed": len(comps),
        "predicted_failures": predicted_failures,
        "metrics": metrics,
        "data_label": "UPLOADED DATA",
    }


def tick_live_readings(db: Session) -> int:
    """Advance in-progress units along a physically plausible leak/temp path."""
    comps = (
        db.query(Component)
        .options(joinedload(Component.measurements))
        .filter(Component.current_test_hour < 168)
        .all()
    )
    n = 0
    rng = np.random.default_rng()
    for c in comps:
        if not c.measurements:
            continue
        last = max(c.measurements, key=lambda m: m.test_hour)
        drift = 0.015 if c.category == "HEALTHY" else 0.08 if c.category == "AGING" else 0.22 if c.category == "SUSPICIOUS" else 0.35
        last.leakage_current = float(last.leakage_current + abs(rng.normal(drift, drift * 0.25)))
        last.temperature = float(last.temperature + rng.normal(0.02, 0.05))
        last.voltage = float(last.voltage + rng.normal(0.0, 0.004))
        c.last_updated = datetime.utcnow()
        n += 1
    db.commit()
    return n
