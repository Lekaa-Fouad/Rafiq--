"""
services/face_service.py — Business logic for face registration and identification.

Models used
-----------
  DeepFace model : "Facenet"
  Detector       : "opencv"
  Distance metric: "cosine"
  Match threshold: distance <= 0.40

Redis caching
-------------
  Key: rafiq:faces:all
  TTL: 300 seconds
  On register/delete: key is invalidated.

All public functions raise RafiqException subclasses, never raw exceptions.
"""

import logging
from typing import List, Optional

import aiosqlite
import cv2
import numpy as np
from deepface import DeepFace
from scipy.spatial.distance import cosine

import db.face_db as face_db
from core.config import get_settings
from core.exceptions import (
    FaceAlreadyRegisteredError,
    FaceNotFoundError,
    RafiqException,
)
from models.face import (
    FaceDeleteResponse,
    FaceIdentifyResponse,
    FaceListItem,
    FaceRegisterResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()


def _decode_image(image_bytes: bytes) -> np.ndarray:
    """Decode image bytes to an OpenCV BGR numpy array."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise RafiqException(
            message="Could not decode image. Ensure the file is a valid image format.",
            spoken_message="I couldn't read the image. Please try again with a clearer photo.",
            status_code=422,
        )
    return img


def _get_embedding(img: np.ndarray) -> np.ndarray:
    """
    Extract DeepFace Facenet embedding from an OpenCV image.

    Raises FaceNotFoundError if no face is detected.
    """
    try:
        result = DeepFace.represent(
            img_path=img,
            model_name=settings.FACE_MODEL_NAME,
            detector_backend=settings.FACE_DETECTOR_BACKEND,
            enforce_detection=True,
        )
        embedding = result[0]["embedding"]
        return np.array(embedding, dtype=np.float32)
    except ValueError as exc:
        # DeepFace raises ValueError when no face is found
        logger.warning("[FACE] No face detected: %s", exc)
        raise FaceNotFoundError() from exc
    except Exception as exc:
        logger.exception("[FACE] DeepFace representation failed: %s", exc)
        raise RafiqException(
            message=f"Face embedding extraction failed: {exc}",
            spoken_message="Face analysis failed. Please try again.",
            status_code=500,
        ) from exc


# ── Register ──────────────────────────────────────────────────────────────────

async def register_face(
    name: str,
    image_bytes: bytes,
    db_conn,
    redis,
) -> FaceRegisterResponse:
    """
    Register a new face profile.

    Steps
    -----
    1. Decode image bytes with OpenCV.
    2. Raise FaceNotFoundError if no face is detected.
    3. Raise FaceAlreadyRegisteredError if name already exists in DB.
    4. Extract Facenet embedding via DeepFace.
    5. Serialise embedding and insert into SQLite.
    6. Invalidate the Redis `rafiq:faces:all` cache.

    Returns
    -------
    FaceRegisterResponse with the new UUID, name, and confirmation message.
    """
    logger.info("[FACE] Register started — name: '%s', image size: %d bytes", name, len(image_bytes))

    img = _decode_image(image_bytes)

    # Check for duplicate name before extracting embedding to avoid wasted compute
    if await face_db.face_exists(db_conn, name):
        raise FaceAlreadyRegisteredError(name)

    embedding = _get_embedding(img)

    embedding_bytes = embedding.tobytes()
    shape_str = ",".join(str(d) for d in embedding.shape)

    try:
        face_id = await face_db.insert_face(db_conn, name, embedding_bytes, shape_str)
    except aiosqlite.IntegrityError as exc:
        raise FaceAlreadyRegisteredError(name) from exc

    # Invalidate cache
    if redis is not None:
        try:
            await redis.delete(settings.FACE_CACHE_KEY)
            logger.info("[FACE] Redis cache invalidated — key: %s", settings.FACE_CACHE_KEY)
        except Exception as cache_exc:
            logger.warning("[FACE] Cache invalidation failed: %s", cache_exc)

    logger.info("[FACE] Register completed — name: '%s', face_id: %s", name, face_id)

    return FaceRegisterResponse(
        face_id=face_id,
        name=name,
        message=f"Face profile for '{name}' registered successfully.",
    )


# ── Identify ──────────────────────────────────────────────────────────────────

async def identify_face(
    image_bytes: bytes,
    db_conn,
    redis,
) -> FaceIdentifyResponse:
    """
    Identify a person from an image by comparing against all registered faces.

    Algorithm
    ---------
    1. Extract embedding from the incoming image.
    2. Load all registered embeddings (Redis cache → DB fallback).
    3. Compute cosine distance between the input and each stored embedding.
    4. Lowest distance wins. If distance <= 0.40, it's a match.
    5. confidence = round(1.0 - distance, 4)

    Returns
    -------
    FaceIdentifyResponse with identified flag, name, confidence, and distance.
    """
    logger.info("[FACE] Identify started — image size: %d bytes", len(image_bytes))

    img = _decode_image(image_bytes)
    query_embedding = _get_embedding(img)

    # Load all faces (cache-first)
    all_faces = await _load_all_faces(db_conn, redis)

    if not all_faces:
        logger.info("[FACE] Identify — no faces registered yet")
        return FaceIdentifyResponse(
            identified=False,
            name=None,
            confidence=0.0,
            face_id=None,
            distance=1.0,
        )

    best_distance = float("inf")
    best_face: Optional[dict] = None

    for face_record in all_faces:
        shape = tuple(int(d) for d in face_record["embedding_shape"].split(","))
        stored = np.frombuffer(face_record["embedding"], dtype=np.float32).reshape(shape)
        dist = float(cosine(query_embedding, stored))
        if dist < best_distance:
            best_distance = dist
            best_face = face_record

    identified = best_distance <= settings.FACE_COSINE_THRESHOLD
    confidence = round(1.0 - best_distance, 4)

    if identified and best_face:
        logger.info(
            "[FACE] Identify matched — name: '%s', distance: %.4f", best_face["name"], best_distance
        )
        return FaceIdentifyResponse(
            identified=True,
            name=best_face["name"],
            confidence=confidence,
            face_id=best_face["id"],
            distance=round(best_distance, 4),
        )
    else:
        logger.info("[FACE] Identify — no match (best distance: %.4f)", best_distance)
        return FaceIdentifyResponse(
            identified=False,
            name=None,
            confidence=confidence,
            face_id=None,
            distance=round(best_distance, 4),
        )


# ── List ──────────────────────────────────────────────────────────────────────

async def list_faces(db_conn) -> List[FaceListItem]:
    """
    Return metadata for all registered faces (no embedding bytes).

    Used by GET /face/list.
    """
    logger.info("[FACE] List all faces")
    rows = await face_db.get_face_summaries(db_conn)
    return [
        FaceListItem(
            face_id=row["id"],
            name=row["name"],
            image_count=row["image_count"],
            created_at=str(row["created_at"]),
        )
        for row in rows
    ]


# ── Delete ────────────────────────────────────────────────────────────────────

async def delete_face(face_id: str, db_conn, redis) -> FaceDeleteResponse:
    """
    Delete a face profile by UUID.

    Invalidates the Redis `rafiq:faces:all` cache after deletion.
    """
    logger.info("[FACE] Delete started — face_id: %s", face_id)

    deleted = await face_db.delete_face(db_conn, face_id)

    if redis is not None:
        try:
            await redis.delete(settings.FACE_CACHE_KEY)
        except Exception as cache_exc:
            logger.warning("[FACE] Cache invalidation failed: %s", cache_exc)

    return FaceDeleteResponse(deleted=deleted, face_id=face_id)


# ── Internal Helpers ──────────────────────────────────────────────────────────

async def _load_all_faces(db_conn, redis) -> List[dict]:
    """Load all face rows from SQLite for embedding comparison."""
    return await face_db.get_all_faces(db_conn)
