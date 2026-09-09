from __future__ import annotations

from io import BytesIO
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

import pandas as pd

from app.services.schema_detection import detect_schema, json_rows, metadata

REQUIRED = [
    "component_id",
    "batch_id",
    "test_hour",
    "component_type",
    "temperature",
    "voltage",
    "current",
    "pressure",
    "vibration",
    "leakage_current",
    "propagation_delay",
    "resistance",
    "capacitance",
]

CMAPSS_COLUMNS = [
    "unit_id",
    "cycle",
    "setting_1",
    "setting_2",
    "setting_3",
    *[f"sensor_{i}" for i in range(1, 22)],
]
CMAPSS_ANALYSIS_MAP = {
    "temperature": "sensor_2",
    "voltage": "setting_1",
    "current": "setting_2",
    "pressure": "sensor_7",
    "vibration": "sensor_8",
    "leakage_current": "sensor_3",
    "propagation_delay": "sensor_4",
    "resistance": "sensor_5",
    "capacitance": "sensor_6",
}


def _is_cmapss(df: pd.DataFrame, filename: str) -> bool:
    if len(df.columns) != 26 or not all(pd.api.types.is_numeric_dtype(c) for c in df.dtypes):
        return False
    stem = PurePosixPath(filename.replace("\\", "/")).stem.lower()
    return all(isinstance(column, int) for column in df.columns) or stem.startswith(("train_fd", "test_fd"))


def _normalise_cmapss(df: pd.DataFrame, filename: str) -> pd.DataFrame:
    df = df.copy()
    df.columns = CMAPSS_COLUMNS
    df["component_id"] = "unit_" + df["unit_id"].astype(int).astype(str)
    df["batch_id"] = PurePosixPath(filename.replace("\\", "/")).stem
    df["test_hour"] = df["cycle"]
    df["component_type"] = "C-MAPSS turbofan unit"
    df["manufacturer"] = "NASA C-MAPSS benchmark"
    for target, source in CMAPSS_ANALYSIS_MAP.items():
        df[target] = df[source]
    return df


def _read_bytes(filename: str, content: bytes) -> tuple[pd.DataFrame, list[str], list[str]]:
    name = filename.lower()
    if name.endswith(".zip"):
        try:
            with ZipFile(BytesIO(content)) as archive:
                candidates = []
                for info in archive.infolist():
                    path = PurePosixPath(info.filename)
                    if info.is_dir() or ".." in path.parts or path.is_absolute():
                        continue
                    if info.file_size > 64 * 1024 * 1024:
                        continue
                    if path.name.lower().startswith(("train_fd", "test_fd")) or path.suffix.lower() in (".csv", ".xlsx", ".xls", ".json", ".txt") and path.name.lower() not in ("readme", "readme.txt"):
                        candidates.append(info)
                if not candidates:
                    return pd.DataFrame(), [], ["ZIP contains no supported engineering dataset files."]
                selected = sorted(candidates, key=lambda item: item.filename.lower())[0]
                extracted = archive.read(selected)
                return _read_bytes(selected.filename, extracted)
        except (BadZipFile, OSError):
            return pd.DataFrame(), [], ["Could not read the ZIP archive."]

    try:
        if name.endswith(".csv"):
            return pd.read_csv(BytesIO(content)), [], []
        if name.endswith((".xlsx", ".xls")):
            return pd.read_excel(BytesIO(content)), [], []
        if name.endswith(".json"):
            return pd.read_json(BytesIO(content)), [], []
        if name.endswith(".txt") or "." not in PurePosixPath(name).name:
            # C-MAPSS files are whitespace separated and have no header.
            try:
                raw = pd.read_csv(BytesIO(content), sep=r"\s+", header=None, engine="python")
                if raw.shape[1] == 26:
                    return raw, ["Detected whitespace-separated NASA C-MAPSS benchmark data."], []
            except Exception:
                pass
            return pd.read_csv(BytesIO(content), sep=None, engine="python"), [], []
    except Exception:
        return pd.DataFrame(), [], ["Could not parse the uploaded dataset. Check the file format and contents."]
    return pd.DataFrame(), [], ["Unsupported dataset format. Use CSV, XLSX, XLS, JSON, TXT, or ZIP."]


def parse_uploaded_file(filename: str, content: bytes, max_bytes: int) -> tuple[pd.DataFrame, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if len(content) > max_bytes:
        errors.append(f"File exceeds maximum size of {max_bytes // (1024 * 1024)} MB.")
        return pd.DataFrame(), warnings, errors
    df, read_warnings, read_errors = _read_bytes(filename, content)
    warnings.extend(read_warnings)
    errors.extend(read_errors)
    if errors:
        return pd.DataFrame(), warnings, errors
    if _is_cmapss(df, filename):
        df = _normalise_cmapss(df, filename)
        warnings.append("C-MAPSS columns mapped to the screening schema; sensor values remain unchanged.")
    df.columns = [str(c).strip().lower() for c in df.columns]
    detected = detect_schema(df, filename)
    if detected["schema"] == "AEGIS_COMPONENT_SCREENING":
        for col in REQUIRED:
            if col not in df.columns:
                errors.append(f"Missing required column: {col}")
    elif detected["schema"] in ("UNKNOWN", "TABULAR_ENGINEERING") and not detected["numeric_columns"]:
        errors.append("No numeric engineering features were detected in this dataset.")
    if errors:
        return df, warnings, errors
    if df.empty:
        errors.append("CSV contains no data rows.")
        return df, warnings, errors
    numeric_cols = [
        "test_hour",
        "temperature",
        "voltage",
        "current",
        "pressure",
        "vibration",
        "leakage_current",
        "propagation_delay",
        "resistance",
        "capacitance",
    ] if detected["schema"] == "AEGIS_COMPONENT_SCREENING" else []
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        bad = int(df[col].isna().sum())
        if bad:
            errors.append(f"Required numeric field '{col}' contains {bad} missing or invalid value(s).")
    if detected["schema"] == "AEGIS_COMPONENT_SCREENING":
        for col in ("component_id", "batch_id", "component_type"):
            df[col] = df[col].astype(str).str.strip()
            blank = int(df[col].isin(("", "nan", "None")).sum())
            if blank:
                errors.append(f"Required field '{col}' contains {blank} blank value(s).")
    return df, warnings, errors


def parse_csv(content: bytes, max_bytes: int) -> tuple[pd.DataFrame, list[str], list[str]]:
    return parse_uploaded_file("dataset.csv", content, max_bytes)


def describe_uploaded_file(filename: str, content: bytes, max_bytes: int) -> dict:
    df, warnings, errors = parse_uploaded_file(filename, content, max_bytes)
    detected = detect_schema(df, filename) if not df.empty else {"schema": "UNKNOWN", "label": "UNCLASSIFIED DATASET", "mapping": {}, "columns": [], "numeric_columns": [], "categorical_columns": [], "time_columns": [], "group_columns": []}
    return {
        "rows": int(len(df)),
        "components": int(df["component_id"].nunique()) if "component_id" in df.columns else int(df[detected["mapping"]["group"]].nunique()) if detected["mapping"].get("group") in df.columns else 0,
        "warnings": warnings,
        "errors": errors,
        "preview": json_rows(df, 12),
        "metadata": metadata(df, detected) if not df.empty else {},
        "schema": detected,
    }
