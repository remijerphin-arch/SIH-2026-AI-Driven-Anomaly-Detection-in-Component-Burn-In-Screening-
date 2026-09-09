from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

ALIASES = {
    "group": ("component_id", "component", "component_number", "part_id", "unit_id", "asset_id", "machine_id", "device_id", "group_id"),
    "batch": ("batch_id", "batch", "lot_id", "lot_number", "group_id"),
    "time": ("test_hour", "hour", "cycle", "time", "timestamp", "datetime", "date"),
    "temperature": ("temperature", "temp", "temperature_c", "temp_c"),
    "voltage": ("voltage", "voltage_v"),
    "current": ("current", "current_a", "amps", "amperage"),
    "pressure": ("pressure", "pressure_pa"),
    "vibration": ("vibration", "vibration_level", "vibration_rms"),
    "resistance": ("resistance", "resistance_ohm"),
    "capacitance": ("capacitance", "capacitance_pf"),
    "leakage_current": ("leakage_current", "leakage", "leakage_current_ua"),
    "propagation_delay": ("propagation_delay", "delay", "propagation_delay_ns"),
}


def _clean(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).strip().lower())


def _find_alias(columns: list[str], names: tuple[str, ...]) -> str | None:
    clean = {_clean(column): column for column in columns}
    for name in names:
        if _clean(name) in clean:
            return clean[_clean(name)]
    return None


def detect_schema(df: pd.DataFrame, filename: str = "dataset") -> dict[str, Any]:
    columns = [str(column) for column in df.columns]
    normalized = {_clean(column) for column in columns}
    sensor_count = sum(1 for column in normalized if re.fullmatch(r"sensor\d+", column))
    setting_count = sum(1 for column in normalized if re.fullmatch(r"setting\d+", column))
    is_cmapss = {"unitid", "cycle"}.issubset(normalized) and sensor_count >= 10 and setting_count >= 1
    mapping: dict[str, str] = {}
    for meaning, aliases in ALIASES.items():
        found = _find_alias(columns, aliases)
        if found:
            mapping[meaning] = found
    numeric = [column for column in columns if pd.api.types.is_numeric_dtype(df[column])]
    categorical = [column for column in columns if column not in numeric]
    time_columns = [column for column in columns if _clean(column) in {_clean(x) for x in ALIASES["time"]}]
    group_columns = [column for column in columns if _clean(column) in {_clean(x) for x in ALIASES["group"] + ALIASES["batch"]}]
    if is_cmapss:
        schema = "C-MAPSS"
        label = "NASA C-MAPSS Benchmark Dataset"
        mapping = {"group": _find_alias(columns, ("unit_id",)) or "unit_id", "time": _find_alias(columns, ("cycle",)) or "cycle"}
        mapping.update({"sensors": "sensor_*", "settings": "setting_*"})
    elif {"component_id", "batch_id", "test_hour"}.issubset(normalized):
        schema = "AEGIS_COMPONENT_SCREENING"
        label = "AEGIS Component Screening Dataset"
    elif mapping.get("time") and numeric:
        schema = "TIME_SERIES" if mapping.get("group") else "GENERIC_ENGINEERING"
        label = "GENERIC ENGINEERING DATASET"
    elif numeric:
        schema = "TABULAR_ENGINEERING"
        label = "GENERIC ENGINEERING DATASET"
    else:
        schema = "UNKNOWN"
        label = "UNCLASSIFIED DATASET"
    return {"schema": schema, "label": label, "mapping": mapping, "columns": columns, "numeric_columns": numeric, "categorical_columns": categorical, "time_columns": time_columns, "group_columns": group_columns}


def metadata(df: pd.DataFrame, detected: dict[str, Any]) -> dict[str, Any]:
    mapping = detected["mapping"]
    group_column = mapping.get("group") if isinstance(mapping.get("group"), str) else None
    time_column = mapping.get("time") if isinstance(mapping.get("time"), str) else None
    quality = {str(column): int(df[column].isna().sum()) for column in df.columns if int(df[column].isna().sum())}
    result: dict[str, Any] = {
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "groups": int(df[group_column].nunique(dropna=True)) if group_column in df.columns else None,
        "group_label": "units" if detected["schema"] == "C-MAPSS" else "groups",
        "numeric_features": len(detected["numeric_columns"]),
        "numeric_columns": detected["numeric_columns"],
        "categorical_features": len(detected["categorical_columns"]),
        "time_columns": detected["time_columns"],
        "sensor_columns": [c for c in df.columns if _clean(c).startswith("sensor")],
        "missing_values": quality,
        "missing_total": int(sum(quality.values())),
        "duplicate_rows": int(df.duplicated().sum()),
        "minimum_time": _safe_extreme(df[time_column], min) if time_column in df.columns else None,
        "maximum_time": _safe_extreme(df[time_column], max) if time_column in df.columns else None,
    }
    return result


def _safe_extreme(series: pd.Series, fn: Any) -> Any:
    values = series.dropna()
    if values.empty:
        return None
    value = fn(values)
    return value.item() if hasattr(value, "item") else value


def json_rows(df: pd.DataFrame, limit: int | None = None) -> list[dict[str, Any]]:
    rows = df.head(limit) if limit else df
    return [{str(k): (v.item() if hasattr(v, "item") else (None if pd.isna(v) else v)) for k, v in row.items()} for row in rows.to_dict(orient="records")]
