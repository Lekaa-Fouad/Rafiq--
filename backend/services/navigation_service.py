"""
services/navigation_service.py — Indoor Navigation stub.

TO IMPLEMENT (teammate guide)
------------------------------
1. Dependencies: OpenCV (already installed) for ArUco detection.

2. Map storage:
   Store maps in SQLite (add a `maps` table) or as JSON files.
   Schema: map_id, markers (JSON array of {marker_id, x, y, label}).

3. Implement `upload_map(map_id, markers, db_conn)`:
   - Upsert map into storage.

4. Implement `get_map(map_id, db_conn)`:
   - Retrieve map markers by ID.

5. Implement `get_navigation_instruction(request, db_conn)`:
   a. Load map from storage.
   b. Find current marker and destination marker positions.
   c. Compute vector from current → destination.
   d. Determine direction: use atan2(dy, dx) to get angle → map to
      "Turn left", "Turn right", "Go straight", "Turn around".
   e. Distance: Euclidean distance scaled to metres (calibrate with known
      physical marker spacing).
   f. Return NavigationResponse with instruction and spoken_instruction.

6. For real-time use (WebSocket stream):
   - Each frame: run cv2.aruco.detectMarkers(frame, aruco_dict)
   - Match detected IDs against stored map → get current position
   - Re-run step 5.

Reference: face_service.py for DB interaction patterns.
"""

import logging

logger = logging.getLogger(__name__)


async def upload_map(map_id: str, _markers: list, _db_conn) -> dict:
    """[STUB] Store an indoor map with ArUco marker positions."""
    logger.info("[NAV] upload_map called — stub, not yet implemented")
    return {"status": "not_implemented"}


async def get_map(map_id: str, _db_conn) -> dict:
    """[STUB] Retrieve an indoor map by ID."""
    logger.info("[NAV] get_map called — stub, not yet implemented")
    return {"status": "not_implemented"}


async def get_navigation_instruction(_request, _db_conn) -> dict:
    """[STUB] Compute and return the next navigation instruction."""
    logger.info("[NAV] get_navigation_instruction called — stub, not yet implemented")
    return {"status": "not_implemented"}
