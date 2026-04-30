import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    storage_dir: str
    api_host: str
    api_port: int
    work_session_timeout_minutes: int


@lru_cache
def get_settings() -> Settings:
    return Settings(
        environment=os.getenv("SERVICE_TRACE_ENV", "local"),
        database_url=os.getenv("DATABASE_URL", "sqlite:///./servicetrace_dev.db"),
        storage_dir=os.getenv("STORAGE_DIR", "./app/storage"),
        api_host=os.getenv("API_HOST", "0.0.0.0"),
        api_port=int(os.getenv("API_PORT", "8000")),
        work_session_timeout_minutes=int(os.getenv("WORK_SESSION_TIMEOUT_MINUTES", "480")),
    )
