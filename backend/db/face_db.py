"""
db/face_db.py — Async SQLite operations for the face recognition database.

All functions accept an aiosqlite connection injected via Depends(get_db).
Tables are created at startup (main.py lifespan event); do NOT call
create_tables() inside request handlers.

Schema
------
faces
  id               TEXT PRIMARY KEY   — UUID v4
    name             TEXT NOT NULL      — display name (unique via index)
  embedding        BLOB NOT NULL      — numpy array serialised with ndarray.tobytes()
  embedding_shape  TEXT NOT NULL      — comma-separated dims, e.g. "128"
  image_count      INTEGER DEFAULT 1
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
"""

import logging
import uuid
from typing import List, Optional

import aiosqlite

logger = logging.getLogger(__name__)

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS faces (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    embedding        BLOB NOT NULL,
    embedding_shape  TEXT NOT NULL,
    image_count      INTEGER DEFAULT 1,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

_CREATE_UNIQUE_NAME_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_faces_name_unique ON faces (name);
"""


async def create_tables(conn: aiosqlite.Connection) -> None:
    """Create the faces table if it does not already exist."""
    await conn.execute(_CREATE_TABLE_SQL)
    await conn.execute(_CREATE_UNIQUE_NAME_INDEX_SQL)
    await conn.commit()
    logger.info("[FACE_DB] Tables verified/created.")


async def insert_face(
    conn: aiosqlite.Connection,
    name: str,
    embedding_bytes: bytes,
    shape_str: str,
) -> str:
    """
    Insert a new face record and return its UUID.

    Parameters
    ----------
    conn            : Active aiosqlite connection.
    name            : Display name for this person.
    embedding_bytes : numpy array serialised via ndarray.tobytes().
    shape_str       : Comma-separated array shape, e.g. "128" or "1,128".
    """
    face_id = str(uuid.uuid4())
    await conn.execute(
        """
        INSERT INTO faces (id, name, embedding, embedding_shape)
        VALUES (?, ?, ?, ?)
        """,
        (face_id, name, embedding_bytes, shape_str),
    )
    await conn.commit()
    logger.info("[FACE_DB] Inserted face '%s' with id=%s", name, face_id)
    return face_id


async def get_all_faces(conn: aiosqlite.Connection) -> List[dict]:
    """
    Return all face records including raw embedding blobs.

    Used by identify_face() to compare embeddings.
    """
    cursor = await conn.execute(
        "SELECT id, name, embedding, embedding_shape, image_count, created_at FROM faces"
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def get_face_summaries(conn: aiosqlite.Connection) -> List[dict]:
    """Return lightweight face metadata (without embedding blobs)."""
    cursor = await conn.execute(
        "SELECT id, name, image_count, created_at FROM faces"
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def get_face_by_name(conn: aiosqlite.Connection, name: str) -> Optional[dict]:
    """Return a face record by name, or None if not found."""
    cursor = await conn.execute(
        "SELECT id, name, embedding, embedding_shape, image_count, created_at FROM faces WHERE name = ?",
        (name,),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def delete_face(conn: aiosqlite.Connection, face_id: str) -> bool:
    """
    Delete a face record by UUID.

    Returns True if a row was deleted, False if no matching record existed.
    """
    cursor = await conn.execute("DELETE FROM faces WHERE id = ?", (face_id,))
    await conn.commit()
    deleted = cursor.rowcount > 0
    if deleted:
        logger.info("[FACE_DB] Deleted face id=%s", face_id)
    else:
        logger.warning("[FACE_DB] Delete attempted on non-existent id=%s", face_id)
    return deleted


async def face_exists(conn: aiosqlite.Connection, name: str) -> bool:
    """Return True if a face with this name is already in the database."""
    cursor = await conn.execute(
        "SELECT 1 FROM faces WHERE name = ? LIMIT 1", (name,)
    )
    row = await cursor.fetchone()
    return row is not None
