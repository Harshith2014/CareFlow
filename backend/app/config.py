from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://careflow:careflow@localhost:5432/careflow"
    environment: Literal["development", "production", "test"] = "development"
    app_origin: str = "http://localhost:5173"
    clinic_timezone: Literal["Asia/Kolkata"] = "Asia/Kolkata"
    session_hours: int = 8
    ai_mode: Literal["mock", "live", "disabled"] = "mock"
    ai_model: str = "gpt-4.1-mini"
    ai_api_key: str = ""
    ai_timeout: float = 20
    ai_max_output_tokens: int = Field(default=1024, ge=128, le=4096)


@lru_cache
def settings():
    return Settings()
