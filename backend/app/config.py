from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    openai_api_key: str
    project_text_dir: Path
    analysis_output_dir: Path
    openai_model: str = "gpt-5-nano"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", env_prefix="", case_sensitive=False
    )

    @property
    def resolved_project_dir(self) -> Path:
        self.project_text_dir.mkdir(parents=True, exist_ok=True)
        return self.project_text_dir.resolve()

    @property
    def resolved_output_dir(self) -> Path:
        self.analysis_output_dir.mkdir(parents=True, exist_ok=True)
        return self.analysis_output_dir.resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
