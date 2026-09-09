from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

ParameterName = Literal[
    "leakage_current",
    "voltage",
    "current",
    "temperature",
    "pressure",
    "vibration",
    "propagation_delay",
    "resistance",
    "capacitance",
]


class AnalyzeRequest(BaseModel):
    component_ids: list[str] | None = None


class PredictRequest(BaseModel):
    component_id: str
    parameter: ParameterName = "leakage_current"


class SettingsUpdate(BaseModel):
    specification_limits: dict[str, float] | None = None
    warning_threshold_pct: float | None = Field(default=None, ge=0.5, le=0.99)
    risk_safe_max: float | None = Field(default=None, ge=0, le=100)
    risk_warning_max: float | None = Field(default=None, ge=0, le=100)
    risk_anomaly_max: float | None = Field(default=None, ge=0, le=100)
    batch_method: str | None = None
    prediction_horizon: int | None = None
    model_selection: str | None = None
    refresh_interval_sec: int | None = None
    theme: str | None = None
    data_retention_days: int | None = None
    weights: dict[str, float] | None = None


class UploadResult(BaseModel):
    rows: int
    components: int
    metadata: dict[str, Any] = Field(default_factory=dict)
    schema_: dict[str, Any] = Field(default_factory=dict, alias="schema")
    detected_format: str | None = None
    selected_file: str | None = None
    analysis: dict[str, Any] | None = None
    warnings: list[str]
    errors: list[str]
    preview: list[dict[str, Any]]


class MeasurementOut(BaseModel):
    test_hour: int
    timestamp: datetime
    temperature: float
    voltage: float
    current: float
    leakage_current: float
    propagation_delay: float
    resistance: float
    capacitance: float

    model_config = {"from_attributes": True}


class AlertOut(BaseModel):
    id: int
    component_id: str
    severity: str
    reason: str
    recommended_action: str
    created_at: datetime


class ComponentSummary(BaseModel):
    component_id: str
    batch_id: str
    component_type: str
    manufacturer: str
    current_test_hour: int
    status: str
    anomaly_score: float
    risk_score: float
    drift_risk: str
    predicted_168h: float | None
    spec_limit: float
    confidence: float
    last_updated: datetime
    data_source: str
    category: str


class LayerScores(BaseModel):
    specification: float
    lot_relative: float
    trend: float
    ml_anomaly: float
    prediction: float
    final_risk: float
    status: str
