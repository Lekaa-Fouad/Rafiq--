"""
core/dependencies.py — Shared FastAPI dependency providers.
"""

from typing import Optional

import aiosqlite
from fastapi import Header, Request

from core.config import get_settings
from core.exceptions import RafiqException


settings = get_settings()


async def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> None:
    """Validate the API key sent in X-API-Key header."""
    if x_api_key != settings.API_KEY:
        raise RafiqException(
            message="Invalid or missing API key.",
            spoken_message="Authentication failed. Please check your API key.",
            status_code=401,
        )


async def get_redis(request: Request):
    """Return the Redis client initialized at app startup, or None."""
    return request.app.state.redis


async def get_db():
    """Yield an async SQLite connection configured for dict-like row access."""
    conn = await aiosqlite.connect(settings.FACE_DB_PATH)
    conn.row_factory = aiosqlite.Row
    try:
        yield conn
    finally:
        await conn.close()
