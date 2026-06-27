"""
routers/indoor.py — Indoor mapping endpoints.

Endpoints
---------
  POST   /indoor/floor-plan          — upload floor plan image + save locations
  GET    /indoor/floor-plans         — list all saved floor plans
  GET    /indoor/floor-plan/{id}     — get a floor plan with its locations
  DELETE /indoor/floor-plan/{id}     — delete a floor plan
  POST   /indoor/route               — get path between two locations
    POST   /indoor/route-to-voice      — get path and download spoken directions
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile

from core.dependencies import get_db, verify_api_key
from core.exceptions import RafiqException
from core.responses import RafiqResponse, success_response
from models.indoor import (
    FloorPlan,
    IndoorRouteRequest,
    IndoorRouteResponse,
    SaveFloorPlanRequest,
    VoiceRouteResponse,
)
from services import indoor_service, voice_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/indoor",
    tags=["Indoor Mapping"],
    dependencies=[Depends(verify_api_key)],
)


@router.post(
    "/floor-plan",
    summary="Upload a floor plan image and save named locations",
    response_model=RafiqResponse[FloorPlan],
)
async def save_floor_plan(
    request: Request,
    name: str = Form(..., description="Name of this floor plan"),
    corridor_y: int = Form(300, description="Y coordinate of corridor centre line"),
    locations_json: str = Form(
        "[]",
        description='JSON array of locations with bounds, door, area_m2',
    ),
    image: UploadFile = File(..., description="Floor plan image (JPEG or PNG)."),
    db_conn=Depends(get_db),
):
    """
    ## Upload Floor Plan

    Upload a floor plan image and define named locations on it.

    ### How to use
    1. Take a photo of the building's floor plan (or use a digital image)
    2. Note the pixel coordinates of each room/exit/stairs
    3. Upload the image with the location data

    ### locations_json format
    Every room **must** include `bounds` (the 4 walls) and `door_side`.
    `door_position` controls where on the wall the door sits (default: `"center"`).

    ```json
    [
      {
        "id": "entrance", "name": "Main Entrance",
        "point": {"x": 100, "y": 500},
        "bounds": {"x1": 50, "y1": 450, "x2": 200, "y2": 550},
        "door_side": "top",
        "door_position": "center",
        "category": "exit"
      },
      {
        "id": "room-101", "name": "Room 101",
        "point": {"x": 200, "y": 300},
        "bounds": {"x1": 100, "y1": 200, "x2": 300, "y2": 380},
        "door_side": "bottom",
        "door_position": "center",
        "category": "room"
      },
      {
        "id": "room-102", "name": "Room 102",
        "point": {"x": 400, "y": 300},
        "bounds": {"x1": 320, "y1": 200, "x2": 500, "y2": 380},
        "door_side": "bottom",
        "door_position": "left",
        "category": "room"
      }
    ]
    ```

    **door_position values:**
    - `"left"` — 25% from the start of the wall
    - `"center"` — middle of the wall (default)
    - `"right"` — 75% from the start of the wall

    ### Categories
    `room`, `exit`, `stairs`, `elevator`, `toilet`, `other`
    """
    import json as json_lib
    import base64

    logger.info("[INDOOR] POST /floor-plan — name: %s", name)

    # Parse locations JSON
    try:
        locations_data = json_lib.loads(locations_json)
    except Exception:
        raise RafiqException(
            message="Invalid locations_json format.",
            spoken_message="Invalid location data.",
            status_code=422,
        )

    # Read image
    try:
        image_bytes = await image.read()
    except Exception as exc:
        raise RafiqException(
            message=f"Failed to read image: {exc}",
            spoken_message="Could not read the floor plan image.",
            status_code=422,
        ) from exc

    # Get image dimensions
    try:
        import cv2
        import numpy as np
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image")
        height, width = img.shape[:2]
    except Exception:
        width, height = 800, 600  # fallback dimensions

    # Store image as base64 data URL so it can be displayed without a file server
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    mime = image.content_type or "image/jpeg"
    image_url = f"data:{mime};base64,{b64}"

    # Build request
    from models.indoor import IndoorLocation, PixelPoint, RoomBounds
    locations = []
    for loc in locations_data:
        loc_id      = loc.get("id", "?")
        door_data   = loc.get("door")
        bounds_data = loc.get("bounds")

        # Validate required fields
        if not bounds_data:
            raise RafiqException(
                message=f"Location '{loc_id}' is missing required 'bounds' (room perimeter).",
                spoken_message="Each room must have a perimeter defined.",
                status_code=422,
            )
        if not loc.get("door_side"):
            raise RafiqException(
                message=f"Location '{loc_id}' is missing required 'door_side' (top/bottom/left/right).",
                spoken_message="Each room must have a door wall specified.",
                status_code=422,
            )

        # Sanitize door_position — only "left", "center", "right" are valid.
        # Users often accidentally pass a door_side value (top/bottom/left/right)
        # here; clamp to "center" instead of crashing.
        _VALID_DOOR_POSITIONS = {"left", "center", "right"}
        raw_door_position = loc.get("door_position", "center")
        if raw_door_position not in _VALID_DOOR_POSITIONS:
            logger.warning(
                "[INDOOR] Location '%s' has invalid door_position=%r "
                "(must be left/center/right). Defaulting to 'center'. "
                "Did you mean door_side=%r?",
                loc_id, raw_door_position, raw_door_position,
            )
            raw_door_position = "center"

        locations.append(IndoorLocation(
            id=loc["id"],
            name=loc["name"],
            point=PixelPoint(x=loc["point"]["x"], y=loc["point"]["y"]),
            bounds=RoomBounds(
                x1=bounds_data["x1"], y1=bounds_data["y1"],
                x2=bounds_data["x2"], y2=bounds_data["y2"],
            ),
            door_side=loc["door_side"],
            door_position=raw_door_position,
            door=PixelPoint(x=door_data["x"], y=door_data["y"]) if door_data else None,
            category=loc.get("category", "room"),
            area_m2=loc.get("area_m2"),
        ))

    save_request = SaveFloorPlanRequest(name=name, corridor_y=corridor_y, locations=locations)
    result = await indoor_service.save_floor_plan(
        save_request, image_url, width, height, db_conn
    )

    return success_response(
        data=result,
        message=f"Floor plan '{name}' saved with {len(locations)} locations.",
        spoken_message=f"Floor plan {name} saved.",
    )


@router.get(
    "/floor-plans",
    summary="List all saved floor plans",
    response_model=RafiqResponse[List[FloorPlan]],
)
async def list_floor_plans(db_conn=Depends(get_db)):
    """List all saved floor plans."""
    logger.info("[INDOOR] GET /floor-plans")
    results = await indoor_service.list_floor_plans(db_conn)
    return success_response(
        data=results,
        message=f"{len(results)} floor plan(s) found.",
        spoken_message=f"You have {len(results)} floor plans.",
    )


@router.get(
    "/floor-plan/{plan_id}",
    summary="Get a floor plan with its locations",
    response_model=RafiqResponse[FloorPlan],
)
async def get_floor_plan(plan_id: str, db_conn=Depends(get_db)):
    """Get a specific floor plan by ID."""
    logger.info("[INDOOR] GET /floor-plan/%s", plan_id)
    result = await indoor_service.get_floor_plan(plan_id, db_conn)
    return success_response(
        data=result,
        message=f"Floor plan '{result.name}' loaded.",
        spoken_message=f"Floor plan {result.name} loaded.",
    )


@router.delete(
    "/floor-plan/{plan_id}",
    summary="Delete a floor plan",
    response_model=RafiqResponse[dict],
)
async def delete_floor_plan(plan_id: str, db_conn=Depends(get_db)):
    """Delete a floor plan and all its locations."""
    logger.info("[INDOOR] DELETE /floor-plan/%s", plan_id)
    deleted = await indoor_service.delete_floor_plan(plan_id, db_conn)
    return success_response(
        data={"deleted": deleted, "id": plan_id},
        message=f"Floor plan {'deleted' if deleted else 'not found'}.",
        spoken_message=f"Floor plan {'deleted' if deleted else 'not found'}.",
    )


@router.post(
    "/route",
    summary="Get indoor navigation path between two locations",
    response_model=RafiqResponse[IndoorRouteResponse],
)
async def get_indoor_route(body: IndoorRouteRequest, db_conn=Depends(get_db)):
    """
    ## Indoor Route

    Find a path between two named locations on a floor plan.

    ### Option A — Use location IDs
    ```json
    {
      "floor_plan_id": "a1b2c3d4",
      "from_location_id": "entrance",
      "to_location_id": "room-101"
    }
    ```

    ### Option B — Type a natural-language sentence
    ```json
    {
      "floor_plan_id": "a1b2c3d4",
      "query_text": "I am in room one and I want to go to room three"
    }
    ```
    Other examples that work:
    - `"from room 101 to the exit"`
    - `"I'm at the toilet, I need to go to room 102"`
    - Arabic: `"أنا في غرفة واحد وأريد الذهاب إلى غرفة ثلاثة"`

    ### Response
    - `path` — list of pixel points to draw on the floor plan image
    - `steps` — turn-by-turn spoken directions
    - `total_distance_meters` — estimated walking distance
    - `speech` — TTS-ready summary
    """
    logger.info(
        "[INDOOR] POST /route — plan: %s, from: %s, to: %s, query: %s",
        body.floor_plan_id, body.from_location_id, body.to_location_id, body.query_text,
    )
    result = await indoor_service.get_indoor_route(body, db_conn)
    return success_response(
        data=result,
        message=f"Indoor route: {result.from_location.name} → {result.to_location.name}",
        spoken_message=result.speech,
    )


@router.post(
    "/route-to-voice",
    summary="Get indoor route and download the spoken directions as MP3",
    response_class=Response,
)
async def get_indoor_route_as_voice(body: IndoorRouteRequest, db_conn=Depends(get_db)):
    """
    ## Indoor Route to Voice

    Resolve an indoor route request, then synthesise the route summary with the
    voice engine so the client can play it immediately.
    """
    logger.info(
        "[INDOOR] POST /route-to-voice — plan: %s, from: %s, to: %s, query: %s",
        body.floor_plan_id,
        body.from_location_id,
        body.to_location_id,
        body.query_text,
    )
    result = await indoor_service.get_indoor_route(body, db_conn)
    audio_bytes, voice_used, mime_type = await voice_service.synthesise_speech(
        text=result.speech,
        voice=None,
        rate=None,
        language=None,
    )

    return Response(
        content=audio_bytes,
        media_type=mime_type,
        headers={
            "Content-Disposition": 'attachment; filename="indoor_route.mp3"',
            "X-Voice-Used": voice_used,
            "X-Audio-Size": str(len(audio_bytes)),
            "X-Indoor-From": result.from_location.name,
            "X-Indoor-To": result.to_location.name,
        },
    )


@router.post(
    "/route-from-voice",
    summary="Speak your route request — get path + spoken directions back",
    response_class=Response,
)
async def get_indoor_route_from_voice(
    request: Request,
    floor_plan_id: str = Form(
        ...,
        description="ID of the floor plan to navigate.",
    ),
    audio: UploadFile = File(
        ...,
        description=(
            "Audio file containing a natural-language route request, "
            "e.g. 'I am in room one and I want to go to room three'."
        ),
    ),
    language: Optional[str] = Form(
        None,
        description="ISO language hint: 'ar' or 'en'. Leave blank for auto-detect.",
    ),
    db_conn=Depends(get_db),
):
    """
    ## Voice-Driven Indoor Navigation  (🎤 → 🗺️ → 🔊)

    The full pipeline in one request:

    1. **STT** — transcribe the uploaded audio with Whisper.
    2. **NLP** — parse the transcript to find *from* and *to* locations,
       e.g. *"I am in room one and I want to go to room three"*.
    3. **Route** — compute the pixel path on the floor plan.
    4. **TTS** — synthesise the spoken directions with Edge-TTS.

    ### Request (multipart/form-data)
    | Field | Type | Required | Description |
    |---|---|---|---|
    | `floor_plan_id` | string | ✅ | ID returned by `POST /indoor/floor-plan` |
    | `audio` | file | ✅ | Audio recording (wav / mp3 / m4a / ogg / flac) |
    | `language` | string | ❌ | `ar` or `en` — auto-detected if omitted |

    ### Response
    Returns an **MP3 audio file** of the spoken directions.

    Extra metadata is in the response headers:

    | Header | Value |
    |---|---|
    | `X-Transcript` | What was heard from your voice |
    | `X-Detected-Language` | Language detected by Whisper |
    | `X-Indoor-From` | Resolved starting location name |
    | `X-Indoor-To` | Resolved destination name |
    | `X-Distance-Meters` | Estimated walking distance |
    | `X-Voice-Used` | Edge-TTS voice name |

    ### Example audio phrases
    - English: *"I am in room one and I want to go to room three"*
    - Arabic: *"أنا في غرفة واحد وأريد الذهاب إلى غرفة ثلاثة"*
    - Short form: *"from room 101 to exit"*
    """
    logger.info(
        "[INDOOR] POST /route-from-voice — plan: %s, audio: %s, lang: %s",
        floor_plan_id, audio.filename, language,
    )

    # ── Step 1: STT ────────────────────────────────────────────────────────────
    try:
        audio_bytes = await audio.read()
    except Exception as exc:
        from core.exceptions import AudioProcessingError
        raise AudioProcessingError(f"Failed to read uploaded audio: {exc}") from exc

    whisper_model = request.app.state.whisper_model
    stt_result = await voice_service.transcribe_audio(
        audio_bytes=audio_bytes,
        whisper_model=whisper_model,
        language=language,
    )

    transcript      = stt_result["transcript"]
    detected_lang   = stt_result["language"]

    logger.info("[INDOOR] STT transcript: '%s' (lang=%s)", transcript, detected_lang)

    if not transcript or not transcript.strip():
        from core.exceptions import RafiqException
        raise RafiqException(
            message="No speech detected in the audio.",
            spoken_message="I could not hear anything. Please speak clearly and try again.",
            status_code=422,
        )

    # ── Step 2 + 3: Parse text → Route ────────────────────────────────────────
    route_request = IndoorRouteRequest(
        floor_plan_id=floor_plan_id,
        query_text=transcript,
    )
    result = await indoor_service.get_indoor_route(route_request, db_conn)

    # ── Step 4: TTS ────────────────────────────────────────────────────────────
    audio_out, voice_used, mime_type = await voice_service.synthesise_speech(
        text=result.speech,
        voice=None,
        rate=None,
        language=detected_lang if detected_lang in ("ar", "en") else None,
    )

    return Response(
        content=audio_out,
        media_type=mime_type,
        headers={
            "Content-Disposition": 'attachment; filename="indoor_route.mp3"',
            "X-Transcript":        transcript,
            "X-Detected-Language": detected_lang,
            "X-Indoor-From":       result.from_location.name,
            "X-Indoor-To":         result.to_location.name,
            "X-Distance-Meters":   str(result.total_distance_meters),
            "X-Voice-Used":        voice_used,
            "X-Audio-Size":        str(len(audio_out)),
        },
    )
