from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


def utcnow() -> datetime:
    return datetime.utcnow()


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    manufacturer: Mapped[str] = mapped_column(String(128), default="Uploaded dataset")
    notes: Mapped[str] = mapped_column(String(512), default="Imported from uploaded aerospace dataset")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    components: Mapped[list["Component"]] = relationship(back_populates="batch")


class Component(Base):
    __tablename__ = "components"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    component_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    batch_pk: Mapped[int] = mapped_column(ForeignKey("batches.id"))
    component_type: Mapped[str] = mapped_column(String(64), index=True)
    manufacturer: Mapped[str] = mapped_column(String(128), default="Uploaded dataset")
    category: Mapped[str] = mapped_column(String(32), default="HEALTHY")
    current_test_hour: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="SAFE", index=True)
    anomaly_score: Mapped[float] = mapped_column(Float, default=0.0)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    drift_risk: Mapped[str] = mapped_column(String(16), default="LOW")
    predicted_168h: Mapped[float | None] = mapped_column(Float, nullable=True)
    spec_limit: Mapped[float] = mapped_column(Float, default=50.0)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    data_source: Mapped[str] = mapped_column(String(32), default="upload")

    batch: Mapped[Batch] = relationship(back_populates="components")
    measurements: Mapped[list["Measurement"]] = relationship(
        back_populates="component", cascade="all, delete-orphan"
    )
    anomaly_results: Mapped[list["AnomalyResult"]] = relationship(
        back_populates="component", cascade="all, delete-orphan"
    )
    predictions: Mapped[list["Prediction"]] = relationship(
        back_populates="component", cascade="all, delete-orphan"
    )
    alerts: Mapped[list["Alert"]] = relationship(
        back_populates="component", cascade="all, delete-orphan"
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="component", cascade="all, delete-orphan"
    )


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (UniqueConstraint("component_pk", "test_hour", name="uq_comp_hour"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    component_pk: Mapped[int] = mapped_column(ForeignKey("components.id"), index=True)
    test_hour: Mapped[int] = mapped_column(Integer, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    temperature: Mapped[float] = mapped_column(Float)
    voltage: Mapped[float] = mapped_column(Float)
    current: Mapped[float] = mapped_column(Float)
    leakage_current: Mapped[float] = mapped_column(Float)
    propagation_delay: Mapped[float] = mapped_column(Float)
    resistance: Mapped[float] = mapped_column(Float)
    capacitance: Mapped[float] = mapped_column(Float)

    component: Mapped[Component] = relationship(back_populates="measurements")


class AnomalyResult(Base):
    __tablename__ = "anomaly_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    component_pk: Mapped[int] = mapped_column(ForeignKey("components.id"), index=True)
    spec_score: Mapped[float] = mapped_column(Float)
    lot_score: Mapped[float] = mapped_column(Float)
    trend_score: Mapped[float] = mapped_column(Float)
    ml_score: Mapped[float] = mapped_column(Float)
    prediction_score: Mapped[float] = mapped_column(Float)
    final_risk_score: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32))
    explanations: Mapped[str] = mapped_column(Text, default="[]")
    feature_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    component: Mapped[Component] = relationship(back_populates="anomaly_results")


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    component_pk: Mapped[int] = mapped_column(ForeignKey("components.id"), index=True)
    parameter: Mapped[str] = mapped_column(String(64), default="leakage_current")
    predicted_168h: Mapped[float] = mapped_column(Float)
    range_low: Mapped[float] = mapped_column(Float)
    range_high: Mapped[float] = mapped_column(Float)
    drift_rate: Mapped[float] = mapped_column(Float)
    probability_limit_cross: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    component: Mapped[Component] = relationship(back_populates="predictions")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    component_pk: Mapped[int] = mapped_column(ForeignKey("components.id"), index=True)
    severity: Mapped[str] = mapped_column(String(16), index=True)
    reason: Mapped[str] = mapped_column(String(512))
    recommended_action: Mapped[str] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    component: Mapped[Component] = relationship(back_populates="alerts")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    component_pk: Mapped[int] = mapped_column(ForeignKey("components.id"), index=True)
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    component: Mapped[Component] = relationship(back_populates="reports")


class ModelRun(Base):
    __tablename__ = "model_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model_type: Mapped[str] = mapped_column(String(64))
    notes: Mapped[str] = mapped_column(String(512), default="")
    metrics_json: Mapped[str] = mapped_column(Text, default="{}")
    sample_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
