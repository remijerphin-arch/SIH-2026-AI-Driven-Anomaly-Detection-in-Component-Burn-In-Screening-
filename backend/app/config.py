from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/aegis.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cors_origin_regex: str = r"https://.*\.vercel\.app"
    max_csv_bytes: int = 256 * 1024 * 1024
    app_name: str = "AEGIS Reliability Platform"
    demo_dataset_base_url: str = "https://raw.githubusercontent.com/remijerphin-arch/SIH-2026-AI-Driven-Anomaly-Detection-in-Component-Burn-In-Screening-/main/Dataset"

    @property
    def project_root(self) -> Path:
        return Path(__file__).resolve().parents[2]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
