# Team Code Guide (Backend)

This guide defines where each type of code belongs and the coding pattern everyone should follow.

## 1) Folder Responsibilities

- `main.py`
  - FastAPI app wiring only.
  - Startup and shutdown resource lifecycle (models, Redis, DB table setup).
  - Global middleware and exception handlers.
  - Router registration.

- `core/`
  - Shared infrastructure only.
  - `config.py`: environment settings and runtime constants.
  - `dependencies.py`: FastAPI `Depends(...)` providers.
  - `exceptions.py`: domain exceptions (`RafiqException` subclasses).
  - `responses.py`: standard response envelope helpers.

- `models/`
  - Pydantic request/response schemas only.
  - No DB queries.
  - No model inference.
  - No business logic.

- `routers/`
  - HTTP/WS endpoint declarations only.
  - Validate request inputs and call service functions.
  - Keep handlers thin: parse input -> call service -> return `success_response(...)`.
  - No heavy computation in router functions.

- `services/`
  - Business logic and AI model interaction.
  - Convert framework/data exceptions into `RafiqException` subclasses.
  - Keep algorithms and orchestration here.
  - Handle optional cache usage safely (degrade when Redis is unavailable).

- `db/`
  - SQL and persistence helpers only.
  - Keep CRUD operations centralized.
  - Do not place API/HTTP code here.

- `ws/`
  - WebSocket stream processing logic only.
  - Routers should delegate to handlers in this package.

- `data/`
  - Runtime artifacts only (database file, embeddings).
  - Never commit generated runtime data.

## 2) Where To Write New Code

When adding a new feature (example: OCR or detection), use this order:

1. Define or update schemas in `models/<feature>.py`.
2. Implement logic in `services/<feature>_service.py`.
3. Call service methods from `routers/<feature>.py`.
4. Add/adjust persistence helpers in `db/` if storage is needed.
5. Register resource/model initialization in `main.py` lifespan if required.
6. Update docs and tests.

## 3) Mandatory Coding Pattern

- Always return API JSON with `success_response(...)` or `error_response(...)`.
- Always raise `RafiqException` subclasses from service layer.
- Keep routers thin and side-effect minimal.
- Load heavy models once at startup; do not load per request.
- Keep fallback behavior explicit when optional infra is down (for example Redis).
- Use typed function signatures and explicit response models.
- Prefer configuration values from `core/config.py` over hardcoded strings/numbers.

## 4) Endpoint Implementation Template

Use this structure in every new router endpoint:

1. Read/validate request payload.
2. Resolve dependencies (`db_conn`, `redis`, model from `app.state`).
3. Call a single service function.
4. Wrap result with `success_response(...)`.

Use this structure in every new service function:

1. Validate domain input.
2. Execute core logic (model/DB/cache).
3. Raise domain exceptions when needed.
4. Return typed model-friendly data.

## 5) Naming Conventions

- Routers: `routers/<feature>.py`
- Services: `services/<feature>_service.py`
- Models: `models/<feature>.py`
- DB helpers: `db/<domain>_db.py`
- Use action-oriented service names:
  - `register_face`, `identify_face`, `run_ocr`, `detect_objects`

## 6) Definition Of Done For Any Feature

Before merging, verify all items:

- Endpoint is mounted and visible in `/docs`.
- Request/response schemas are in `models/`.
- Service logic is in `services/`.
- No heavy logic inside router handlers.
- Errors are mapped to `RafiqException` subclasses.
- Config values are not hardcoded if they can change by environment.
- Manual integration path is tested with `test_api.py` or equivalent tests.

## 7) Current Feature Status

- Implemented: health, voice (STT/TTS), face recognition.
- Stubs to implement with this pattern: OCR, detection, navigation, WebSocket stream.
