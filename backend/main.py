"""
main.py — Rafiq FastAPI application entry point.

Startup sequence
----------------
1. Load Whisper model into app.state.whisper_model
2. Connect to Redis and verify with ping()
3. Create SQLite tables for face DB if they don't exist
4. Create ./data/embeddings/ directory
5. Load YOLOv8 and MiDaS models into app.state

Routers
-------
/voice      — Speech-to-Text and Text-to-Speech
/face       — Face registration and identification
/ocr        — OCR (stub)
/detect     — Object detection (stub)
/navigate   — Indoor navigation (stub)
/health     — Service health check (no auth)
/ws         — WebSocket stream (stub)

Run with: uvicorn main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite
import redis.asyncio as aioredis
import torch  # <-- تمت الإضافة
from ultralytics import YOLO  # <-- تمت الإضافة
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import get_settings
from core.exceptions import RafiqException
from core.responses import error_response
from db import face_db
<<<<<<< HEAD
from dotenv import load_dotenv

load_dotenv()  # Must be called before NLPService is imported

from routers import detection, face, health, indoor, navigation, ocr, voice, ws as ws_router, nlp as nlp_router
=======
from routers import detection, face, health, indoor, navigation, ocr, voice, ws as ws_router
>>>>>>> bcf7dd4 (mobile app)
from services import indoor_service

# ── Logging Setup ─────────────────────────────────────────────────────────────

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup → yield → shutdown."""

    logger.info("=== Rafiq API starting up ===")

    # 1. Load Whisper model
    try:
        from faster_whisper import WhisperModel
        logger.info(
            "[STARTUP] Loading Whisper model '%s' on device='%s' compute_type='%s'...",
            settings.WHISPER_MODEL_SIZE,
            settings.WHISPER_DEVICE,
            settings.WHISPER_COMPUTE_TYPE,
        )
        app.state.whisper_model = WhisperModel(
            settings.WHISPER_MODEL_SIZE,
            device=settings.WHISPER_DEVICE,
            compute_type=settings.WHISPER_COMPUTE_TYPE,
        )
        logger.info("[STARTUP] Whisper model loaded successfully.")
    except Exception as exc:
        logger.exception("[STARTUP] Failed to load Whisper model: %s", exc)
        app.state.whisper_model = None  # Allow startup to continue; /health will report it

    # 2. Connect to Redis
    try:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=False,
        )
        await redis_client.ping()
        app.state.redis = redis_client
        logger.info("[STARTUP] Redis connected: %s", settings.REDIS_URL)
    except Exception as exc:
        logger.warning("[STARTUP] Redis unavailable: %s — caching disabled.", exc)
        app.state.redis = None

    # 3. Create data directories
    db_dir = Path(settings.FACE_DB_PATH).parent
    db_dir.mkdir(parents=True, exist_ok=True)
    Path(settings.FACE_EMBEDDINGS_DIR).mkdir(parents=True, exist_ok=True)
    logger.info("[STARTUP] Data directories verified.")

    # 4. Create SQLite face DB tables
    try:
        async with aiosqlite.connect(settings.FACE_DB_PATH) as conn:
            await face_db.create_tables(conn)
        logger.info("[STARTUP] Face DB tables verified: %s", settings.FACE_DB_PATH)
    except Exception as exc:
        logger.exception("[STARTUP] Failed to initialise face DB: %s", exc)

<<<<<<< HEAD
    # 5. Create indoor mapping DB tables
=======
    # 4b. Create indoor mapping DB tables
>>>>>>> bcf7dd4 (mobile app)
    try:
        async with aiosqlite.connect(settings.FACE_DB_PATH) as conn:
            await indoor_service.create_tables(conn)
        logger.info("[STARTUP] Indoor mapping tables verified.")
    except Exception as exc:
        logger.exception("[STARTUP] Failed to initialise indoor mapping tables: %s", exc)

<<<<<<< HEAD
    # 6. Load YOLO and MiDaS models
=======
    # 5. Load YOLO and MiDaS models (تمت الإضافة هنا)
>>>>>>> bcf7dd4 (mobile app)
    try:
        logger.info("[STARTUP] Loading YOLOv8 and MiDaS models...")
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        app.state.device = device
        
        # Load YOLO
        app.state.yolo_model = YOLO("yolov8m.pt")
        
        # Load MiDaS
        midas = torch.hub.load("intel-isl/MiDaS", "MiDaS_small", trust_repo=True).to(device)
        midas.eval()
        app.state.midas_model = midas
        app.state.midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True).small_transform
        
        logger.info("[STARTUP] YOLO and MiDaS models loaded successfully.")
    except Exception as exc:
        logger.exception("[STARTUP] Failed to load Detection models: %s", exc)
        app.state.yolo_model = None
        app.state.midas_model = None

    logger.info("=== Rafiq API ready ===")

    yield  # ── Application running ──────────────────────────────────────────

    # Shutdown
    logger.info("=== Rafiq API shutting down ===")
    if app.state.redis:
        await app.state.redis.aclose()
        logger.info("[SHUTDOWN] Redis connection closed.")
        
    # Clean up Detection models (تمت الإضافة هنا لتنظيف الذاكرة)
    app.state.yolo_model = None
    app.state.midas_model = None


# ── App Factory ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Rafiq API",
    description=(
        "Voice-first AI assistant backend for visually impaired users.\n\n"
        "All endpoints (except `/health`) require an `X-API-Key` header.\n\n"
        "**Implemented**: Voice STT/TTS, Face Recognition\n\n"
        "**Stubs (coming soon)**: OCR, Object Detection, Navigation, WebSocket stream"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.ENVIRONMENT == "development" else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log every incoming request and its response status."""
    logger.info("→ %s %s", request.method, request.url.path)
    response = await call_next(request)
    logger.info("← %s %s [%d]", request.method, request.url.path, response.status_code)
    return response


# ── Global Exception Handlers ─────────────────────────────────────────────────

@app.exception_handler(RafiqException)
async def rafiq_exception_handler(request: Request, exc: RafiqException):
    """Convert every RafiqException into the standard error response envelope."""
    logger.warning("[EXCEPTION] %s — %s", type(exc).__name__, exc.message)
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(
            message=exc.message,
            spoken_message=exc.spoken_message,
        ).model_dump(),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all for any unhandled exception — prevents raw tracebacks reaching clients."""
    logger.exception("[EXCEPTION] Unhandled error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content=error_response(
            message="An unexpected internal error occurred.",
            spoken_message="Something went wrong. Please try again.",
        ).model_dump(),
    )


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(ocr.router)             # /ocr
app.include_router(detection.router)       # /detect
app.include_router(navigation.router)      # /navigate
app.include_router(indoor.router)          # /indoor  ← indoor mapping
app.include_router(ws_router.router)       # /ws
app.include_router(health.router)          # /health  — no auth
app.include_router(voice.router)           # /voice
app.include_router(face.router)            # /face
app.include_router(nlp_router.router)      # /nlp


# ── Dev entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)