from functools import lru_cache
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://careflow:careflow@localhost:5432/careflow"
    environment: Literal["development", "production", "test"] = "development"
    app_origin: str = "http://localhost:5173"
    clinic_timezone: str = "Asia/Kolkata"

    @field_validator("clinic_timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError:
            raise ValueError(f"Unknown IANA timezone: {value!r}") from None
        return value
    session_hours: int = 8
    static_dir: str = ""
    ai_mode: Literal["mock", "live", "disabled"] = "mock"
    ai_model: str = "gpt-4.1-mini"
    ai_api_key: str = ""
    ai_timeout: float = 20
    ai_max_output_tokens: int = Field(default=1024, ge=128, le=4096)


@lru_cache
def settings():
    return Settings()
