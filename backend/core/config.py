"""
core/config.py — Application settings loaded from environment variables.

All configuration is centralised here. Import get_settings() anywhere you
need a setting; the @lru_cache ensures the .env file is only read once.
"""

from functools import lru_cache
import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Security ─────────────────────────────────────────────────────────────
    API_KEY: str = "change-me-in-production"

    # ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Whisper (STT) ────────────────────────────────────────────────────────
    WHISPER_MODEL_SIZE: str = "base"
    WHISPER_DEVICE: str = "cpu"
    WHISPER_COMPUTE_TYPE: str = "int8"

    # ── Face Recognition ─────────────────────────────────────────────────────
    FACE_DB_PATH: str = "./data/faces.db"
    FACE_EMBEDDINGS_DIR: str = "./data/embeddings"
    FACE_MODEL_NAME: str = "Facenet"
    FACE_DETECTOR_BACKEND: str = "opencv"
    FACE_COSINE_THRESHOLD: float = 0.40
    FACE_CACHE_KEY: str = "rafiq:faces:all"
    FACE_CACHE_TTL_SECONDS: int = 300

    # ── TTS (Edge-TTS) ───────────────────────────────────────────────────────
    TTS_DEFAULT_VOICE: str = "en-US-JennyNeural"
    TTS_DEFAULT_RATE: str = "+0%"
    TTS_DEFAULT_VOLUME: str = "+0%"

    
    # ── Google-cloud-dialogflow ──────────────────────────────────────────────────────────────
    
    GOOGLE_PROJECT_ID: str = os.getenv("GOOGLE_PROJECT_ID", "")
    GOOGLE_APPLICATION_CREDENTIALS: str = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")

    # ── General ──────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    """Return the cached Settings instance (reads .env once)."""
    return Settings()