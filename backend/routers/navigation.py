"""
routers/navigation.py — Indoor Navigation endpoint stubs.

TO IMPLEMENT
------------
See `services/navigation_service.py` for the full implementation guide.

Quick summary:
  1. Dependencies: OpenCV (already installed) — use cv2.aruco for marker detection.
  2. Add a `maps` table to the SQLite DB (or use JSON files in ./data/maps/).
  3. Implement upload_map, get_map, get_navigation_instruction in navigation_service.py.
  4. Replace stub bodies below with calls to the service functions.

Follow the same patterns as `routers/face.py`.
"""

import logging

from fastapi import APIRouter, Depends

from core.dependencies import get_db, verify_api_key
from core.responses import RafiqResponse, success_response
from models.navigation import MapUploadRequest, NavigationRequest

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/navigate",
    tags=["Navigation"],
    dependencies=[Depends(verify_api_key)],
)


@router.post(
    "/map",
    summary="Upload indoor map markers — coming soon",
    response_model=RafiqResponse[dict],
)
async def upload_map(
    body: MapUploadRequest,
    db_conn=Depends(get_db),
):
    """
    ## Upload Indoor Map

    **[STUB — Not yet implemented]**

    ### Planned behaviour
    - Accept a list of ArUco marker positions with semantic labels.
    - Store the map in SQLite indexed by `map_id`.
    - Overwrite the map if `map_id` already exists.

    ### Implementation steps
    See `services/navigation_service.py` → `upload_map()`.

    ### Expected request
    ```json
    {
      "map_id": "building-a-floor-1",
      "markers": [
        {"marker_id": 1, "x": 0.0, "y": 0.0, "label": "entrance"},
        {"marker_id": 2, "x": 5.0, "y": 0.0, "label": "room_101"}
      ]
    }
    ```
    """
    logger.info("[NAV] upload_map stub called — map_id: %s", body.map_id)
    return success_response(
        data={"status": "not_implemented"},
        message="Map upload is not yet implemented.",
        spoken_message="This feature is coming soon.",
    )


@router.get(
    "/map/{map_id}",
    summary="Retrieve a stored indoor map — coming soon",
    response_model=RafiqResponse[dict],
)
async def get_map(
    map_id: str,
    db_conn=Depends(get_db),
):
    """
    ## Get Indoor Map

    **[STUB — Not yet implemented]**

    ### Planned behaviour
    - Look up `map_id` in storage.
    - Return the full list of marker positions with labels.
    - Return 404 wrapped in error_response() if map not found.

    ### Implementation steps
    See `services/navigation_service.py` → `get_map()`.
    """
    logger.info("[NAV] get_map stub called — map_id: %s", map_id)
    return success_response(
        data={"status": "not_implemented"},
        message="Map retrieval is not yet implemented.",
        spoken_message="This feature is coming soon.",
    )


@router.post(
    "/guide",
    summary="Get next navigation instruction — coming soon",
    response_model=RafiqResponse[dict],
)
async def get_navigation_guide(
    body: NavigationRequest,
    db_conn=Depends(get_db),
):
    """
    ## Navigation Guide

    **[STUB — Not yet implemented]**

    ### Planned behaviour
    Using **ArUco marker detection** (cv2.aruco):
    1. Detect visible markers in the device camera frame.
    2. Match detected marker IDs against the stored map.
    3. Compute the vector from `current_marker_id` to the destination label.
    4. Convert vector angle to a directional instruction:
       - atan2(dy, dx) → 'Turn left', 'Turn right', 'Go straight', 'Turn around'
    5. Compute Euclidean distance and scale to metres.
    6. Return `NavigationResponse` with instruction, spoken instruction,
       next waypoint marker ID, and distance.

    ### Implementation steps
    See `services/navigation_service.py` → `get_navigation_instruction()`.

    ### Expected response
    ```json
    {
      "instruction": "Turn left and walk 10 steps.",
      "spoken_instruction": "Turn left and walk approximately ten steps to reach room one-oh-one.",
      "next_marker_id": 3,
      "distance_meters": 4.5
    }
    ```
    """
    logger.info(
        "[NAV] guide stub called — map: %s, from: %d, to: %s",
        body.map_id, body.current_marker_id, body.destination_label,
    )
    return success_response(
        data={"status": "not_implemented"},
        message="Navigation guidance is not yet implemented.",
        spoken_message="This feature is coming soon.",
    )
