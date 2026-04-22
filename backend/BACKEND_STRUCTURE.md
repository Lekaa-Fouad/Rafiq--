# Rafiq Backend — Structure Guide for us

> **Purpose:** This document explains every file and folder in the backend so we can jump straight to the right place when implementing a new feature.

---

## Quick Start

```bash
# 1. Create & activate virtual environment
python -m venv venv
source venv/bin/activate        # Linux/macOS
# OR: venv\Scripts\activate    # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the dev server
uvicorn main:app --reload --port 8000

# 4. Open the interactive API docs
# → http://127.0.0.1:8000/docs   (Swagger UI)
# → http://127.0.0.1:8000/redoc  (ReDoc)

# 5. Test voice and face endpoints
python test_api.py
```

---

## Directory Tree

```
backend/
├── main.py                  ← App entry point, startup logic, router mounting
├── requirements.txt         ← All Python dependencies
├── .env                     ← Local secrets (API key, Redis URL, model settings)
├── .env.example             ← Template — commit this, NOT .env
├── test_api.py              ← Integration tests for voice + face endpoints
│
├── core/                    ← Shared infrastructure (used by ALL features)
│   ├── config.py            ← All settings / environment variables
│   ├── dependencies.py      ← FastAPI Depends() providers (auth, DB, Redis)
│   ├── exceptions.py        ← Custom exception classes
│   └── responses.py         ← Unified JSON envelope (RafiqResponse)
│
├── routers/                 ← HTTP route definitions (thin controllers)
│   ├── voice.py             (DONE) STT + TTS
│   ├── face.py              (DONE) Register / Identify / List / Delete
│   ├── health.py            (DONE) GET /health
│   ├── ocr.py               (STUB) your team implements this
│   ├── detection.py         (STUB) your team implements this
│   ├── navigation.py        (STUB) your team implements this
│   └── ws.py                (STUB) your team implements this
│
├── services/                ← Business logic / AI model calls
│   ├── voice_service.py     (DONE) Whisper STT + Edge-TTS TTS
│   ├── face_service.py      (DONE) DeepFace register/identify/list/delete
│   ├── ocr_service.py       (STUB) implement OCR logic here
│   ├── detection_service.py (STUB) implement YOLO logic here
│   └── navigation_service.py (STUB) implement indoor-nav logic here
│
├── models/                  ← Pydantic request/response schemas
│   ├── voice.py             (DONE) STTResponse, TTSRequest, TTSResponse
│   ├── face.py              (DONE) FaceRegisterResponse, FaceIdentifyResponse, …
│   ├── ocr.py               (STUB) define OCR schemas here
│   ├── detection.py         (STUB) define Detection schemas here
│   └── navigation.py        (STUB) define Navigation schemas here
│
├── db/
│   └── face_db.py           (DONE) async SQLite helpers for face records
│
├── ws/                      ← WebSocket code (future)
│
└── data/                    ← Runtime data (git-ignored)
    ├── faces.db             — SQLite database created automatically
    └── embeddings/          — Face embedding files
```

---

## How a Request Flows

```
Mobile App
    |
    v  HTTP request with X-API-Key header
+------------------------------------------------------+
|  FastAPI  (main.py)                                   |
|    |                                                  |
|    +-> Middleware: log request                        |
|    |                                                  |
|    +-> verify_api_key()  <- core/dependencies.py     |
|    |       if key wrong -> 401 RafiqException         |
|    |                                                  |
|    +-> Router handler    <- routers/xxx.py            |
|    |       validates body/file (Pydantic)             |
|    |                                                  |
|    +-> Service function  <- services/xxx_service.py  |
|    |       runs AI model / DB query                   |
|    |       raises RafiqException on error             |
|    |                                                  |
|    +-> DB/Redis          <- db/ or redis from state  |
|    |                                                  |
|    +-> Response          <- core/responses.py        |
|            success_response(data, message, ...)        |
+------------------------------------------------------+
    |
    v  JSON response (or audio/mpeg for TTS)
Mobile App
```

---

## Implemented Features

### Voice — `/voice`

| Method | Path        | Description                           |
|--------|-------------|---------------------------------------|
| POST   | /voice/stt  | Upload audio -> transcription JSON    |
| POST   | /voice/tts  | Send text form field -> download MP3  |

**STT details:**
- Uses **faster-whisper** (loaded once at startup into `app.state.whisper_model`)
- Form fields: `audio` (file), `language` (optional: `ar` / `en`)
- Returns: `{ transcript, language, confidence, duration_seconds }`

**TTS details:**
- Uses **edge-tts** (Microsoft Edge neural voices — free, no API key)
- Response is a **downloadable MP3 file** (`Content-Disposition: attachment`)
- Form fields: `text` (required), `voice` (optional), `rate` (optional), `language` (optional)
- Auto-detects Arabic vs English from Unicode character ranges
- Default voices: `en-US-JennyNeural` / `ar-SA-ZariyahNeural`

---

### Face Recognition — `/face`

| Method | Path              | Description                              |
|--------|-------------------|------------------------------------------|
| POST   | /face/register    | Upload image + name -> register face     |
| POST   | /face/identify    | Upload image -> identify person          |
| GET    | /face/list        | List all registered face profiles        |
| DELETE | /face/{face_id}   | Delete a face profile by UUID            |

**Details:**
- Uses **DeepFace** with **Facenet** model + **opencv** detector
- Embeddings stored in **SQLite** (`data/faces.db`)
- Cosine distance threshold: <= 0.40 = match
- Redis used to cache the face list (optional — works without Redis)

---

## Configuration (`.env`)

| Variable              | Default                    | Description                          |
|-----------------------|----------------------------|--------------------------------------|
| `API_KEY`             | `123`                      | Secret key required in `X-API-Key` header |
| `REDIS_URL`           | `redis://localhost:6379/0` | Redis connection (optional)          |
| `WHISPER_MODEL_SIZE`  | `base`                     | `tiny`, `base`, `small`, `medium`, `large-v3` |
| `WHISPER_DEVICE`      | `cpu`                      | `cpu` or `cuda`                      |
| `WHISPER_COMPUTE_TYPE`| `int8`                     | `int8`, `float16`, `float32`         |
| `FACE_DB_PATH`        | `./data/faces.db`          | SQLite database path                 |
| `FACE_EMBEDDINGS_DIR` | `./data/embeddings`        | Face embedding storage dir           |
| `TTS_DEFAULT_VOICE`   | `en-US-JennyNeural`        | Default Edge-TTS voice               |
| `TTS_DEFAULT_RATE`    | `+0%`                      | Default speech rate                  |
| `LOG_LEVEL`           | `INFO`                     | `DEBUG`, `INFO`, `WARNING`, `ERROR`  |
| `ENVIRONMENT`         | `development`              | `development` or `production`        |

---

## Error Response Envelope

Every endpoint (except TTS which returns audio) returns this JSON structure:

```json
{
  "success": true,
  "data": { "..." : "..." },
  "message": "Human-readable status for developers",
  "spoken_message": "What the app reads aloud to the user"
}
```

On error:
```json
{
  "success": false,
  "data": null,
  "message": "Detailed error description",
  "spoken_message": "Friendly message for user"
}
```

---

## Adding a New Feature — Checklist

When your team is ready to implement a stub feature, follow this checklist:

- [ ] Define Pydantic models in `models/your_feature.py`
- [ ] Write business logic in `services/your_feature_service.py`
  - Always raise `RafiqException` subclasses (never raw exceptions)
  - Load heavy models at startup via `main.py` lifespan (not per-request)
- [ ] Update the router in `routers/your_feature.py`
  - Use `request.app.state.your_model` to access the pre-loaded model
  - Return `success_response(data=..., message=..., spoken_message=...)`
- [ ] Add any new packages to `requirements.txt`
- [ ] Load models in `main.py` lifespan (`app.state.xxx = YourModel(...)`)
- [ ] Add a test case to `test_api.py`

---

## API Authentication

All endpoints (except `/health`) require an `X-API-Key` header:

```bash
curl -H "X-API-Key: 123" http://localhost:8000/face/list
```

In Swagger UI (`/docs`), click **Authorize** and enter the key.

---

## Running Tests

```bash
# Run all tests (server must be running)
python test_api.py

# Only voice tests
python test_api.py --voice

# Only face tests
python test_api.py --face

# Custom server URL / API key
python test_api.py --url http://192.168.1.100:8000 --key my-secret
```

> **Note:** Face tests with a synthetic placeholder image will return 422 for register/identify —
> this is expected because DeepFace requires a real human face photo.
> Use an actual portrait image for full face testing.
