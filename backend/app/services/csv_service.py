from __future__ import annotations

from io import BytesIO

import pandas as pd

REQUIRED = ["component_id", "batch_id", "test_hour"]
OPTIONAL = [
    "timestamp",
    "temperature",
    "voltage",
    "current",
    "leakage_current",
    "propagation_delay",
    "resistance",
    "capacitance",
    "component_type",
    "manufacturer",
]
DEFAULTS = {
    "temperature": 85.0,
    "voltage": 5.0,
    "current": 90.0,
    "leakage_current": 10.0,
    "propagation_delay": 12.0,
    "resistance": 100.0,
    "capacitance": 10.0,
}


def parse_uploaded_file(filename: str, content: bytes, max_bytes: int) -> tuple[pd.DataFrame, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if len(content) > max_bytes:
        errors.append(f"File exceeds maximum size of {max_bytes // (1024 * 1024)} MB.")
        return pd.DataFrame(), warnings, errors
    ext = (filename or "").lower()
    try:
        if ext.endswith(".csv"):
            df = pd.read_csv(BytesIO(content))
        elif ext.endswith((".xlsx", ".xls")):
            df = pd.read_excel(BytesIO(content))
        elif ext.endswith(".json"):
            df = pd.read_json(BytesIO(content))
        else:
            errors.append("Unsupported dataset format. Use CSV, XLSX, XLS, or JSON.")
            return pd.DataFrame(), warnings, errors
    except Exception:
        errors.append("Could not parse the uploaded dataset. Check the file format and column structure.")
        return pd.DataFrame(), warnings, errors
    df.columns = [str(c).strip().lower() for c in df.columns]
    for col in REQUIRED:
        if col not in df.columns:
            errors.append(f"Missing required column: {col}")
    if errors:
        return df, warnings, errors
    if df.empty:
        errors.append("CSV contains no data rows.")
        return df, warnings, errors
    for col in OPTIONAL:
        if col not in df.columns and col in DEFAULTS:
            df[col] = DEFAULTS[col]
            warnings.append(f"Column '{col}' missing — filled with default {DEFAULTS[col]}.")
    numeric_cols = ["test_hour", *DEFAULTS.keys()]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            bad = int(df[col].isna().sum())
            if bad:
                warnings.append(f"{bad} non-numeric values in '{col}' were dropped.")
                df = df.dropna(subset=[col])
    df["component_id"] = df["component_id"].astype(str).str.strip()
    df["batch_id"] = df["batch_id"].astype(str).str.strip()
    if "component_type" not in df.columns:
        df["component_type"] = "Unknown"
        warnings.append("Column 'component_type' missing — set to Unknown.")
    return df, warnings, errors


def parse_csv(content: bytes, max_bytes: int) -> tuple[pd.DataFrame, list[str], list[str]]:
    return parse_uploaded_file("dataset.csv", content, max_bytes)
