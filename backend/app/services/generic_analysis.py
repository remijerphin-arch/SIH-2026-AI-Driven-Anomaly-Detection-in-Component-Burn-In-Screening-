from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import RobustScaler


def analyze_generic(rows: list[dict[str, Any]], schema: dict[str, Any]) -> dict[str, Any]:
    frame = pd.DataFrame(rows)
    numeric = [column for column in schema.get("numeric_columns", []) if column in frame.columns]
    if not numeric:
        return {"analyzed": 0, "anomalies": 0, "message": "Insufficient data for numerical analysis."}
    values = frame[numeric].apply(pd.to_numeric, errors="coerce")
    imputed = SimpleImputer(strategy="median").fit_transform(values)
    scaled = RobustScaler().fit_transform(imputed)
    model = IsolationForest(n_estimators=220, contamination="auto", random_state=42, n_jobs=1)
    model.fit(scaled)
    raw = -model.decision_function(scaled)
    low, high = np.percentile(raw, 5), np.percentile(raw, 95)
    scores = np.zeros(len(raw)) if high - low < 1e-9 else np.clip((raw - low) / (high - low), 0, 1) * 100
    medians = values.median(numeric_only=True)
    deviations = values.subtract(medians).abs().divide(values.std(numeric_only=True).replace(0, np.nan)).fillna(0)
    row_deviation = deviations.max(axis=1).to_numpy()
    anomaly_mask = (scores >= 70) | (row_deviation >= 3)
    severity = np.where(scores >= 85, "CRITICAL", np.where(anomaly_mask, "WARNING", "NORMAL"))
    group_column = schema.get("mapping", {}).get("group")
    time_column = schema.get("mapping", {}).get("time")
    findings = []
    for index in np.flatnonzero(anomaly_mask)[:100]:
        parameter = str(deviations.iloc[index].idxmax())
        findings.append({
            "row": int(index),
            "identifier": str(frame.iloc[index][group_column]) if group_column in frame.columns else None,
            "time": frame.iloc[index][time_column] if time_column in frame.columns else None,
            "parameter": parameter,
            "observed": _value(frame.iloc[index][parameter]),
            "baseline": _value(medians[parameter]),
            "deviation": round(float(row_deviation[index]), 3),
            "anomaly_score": round(float(scores[index]), 2),
            "severity": str(severity[index]),
            "reason": f"{parameter} differs from the dataset median by {row_deviation[index]:.2f} standard deviations.",
        })
    return {
        "analyzed": int(len(frame)),
        "anomalies": int(anomaly_mask.sum()),
        "anomaly_percentage": round(float(anomaly_mask.mean() * 100), 2),
        "highest_anomaly_score": round(float(scores.max()), 2),
        "severity_distribution": {name: int((severity == name).sum()) for name in ("NORMAL", "WARNING", "CRITICAL")},
        "affected_groups": len({item["identifier"] for item in findings if item["identifier"] is not None}),
        "affected_parameters": sorted({item["parameter"] for item in findings}),
        "imputation": "Median imputation used only on a preprocessing copy for model fitting; original values are preserved.",
        "findings": findings,
    }


def _value(value: Any) -> Any:
    if pd.isna(value):
        return None
    return value.item() if hasattr(value, "item") else value
