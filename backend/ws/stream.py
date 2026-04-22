"""
ws/stream.py — WebSocket handler for real-time frame processing.

WS /ws/stream

TO IMPLEMENT (teammate guide)
------------------------------
When fully implemented, this endpoint receives continuous JPEG frames
from the mobile app. Each frame is processed through the object detection
and navigation modules. Results are pushed back as JSON events:

  {"type": "detection", "objects": [...]}
  {"type": "navigation", "instruction": "..."}

Use asyncio.gather() to run detection and navigation concurrently per frame:

    detection_task = asyncio.create_task(
        detection_service.detect_objects(frame_bytes, app.state.yolo_model)
    )
    navigation_task = asyncio.create_task(
        navigation_service.get_navigation_instruction(nav_request, db_conn)
    )
    detection_result, nav_result = await asyncio.gather(
        detection_task, navigation_task, return_exceptions=True
    )

Each result is then sent back as a separate JSON message over the WebSocket.

Frame format: raw JPEG bytes sent as binary WebSocket messages.
Response format: JSON text messages with "type" field.

Steps to implement:
  1. Add API key validation for WebSocket (query param or first message).
  2. Load map_id from initial handshake message.
  3. Track current ArUco marker from each frame via navigation_service.
  4. Broadcast detection + navigation events back to client.
  5. Handle disconnection gracefully (WebSocketDisconnect).
"""

import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


async def stream_handler(websocket: WebSocket) -> None:
    """
    WebSocket handler for /ws/stream.

    Current stub behaviour:
    - Accepts the connection and sends a "connected" event.
    - For each binary frame received, echoes back a "frame_received" event.
    - On disconnect, logs and exits cleanly.

    Replace this stub with the full implementation described in the module docstring.
    """
    await websocket.accept()
    logger.info("[WS] Client connected to /ws/stream")

    connected_message = json.dumps({
        "type": "connected",
        "message": "Stream ready",
    })
    await websocket.send_text(connected_message)

    try:
        while True:
            data = await websocket.receive()

            if "bytes" in data and data["bytes"]:
                frame_bytes = data["bytes"]
                logger.info("[WS] Binary frame received — %d bytes (stub)", len(frame_bytes))

                response = json.dumps({
                    "type": "frame_received",
                    "status": "not_implemented",
                    "frame_size_bytes": len(frame_bytes),
                })
                await websocket.send_text(response)

            elif "text" in data and data["text"]:
                logger.info("[WS] Text message received: %s", data["text"])
                response = json.dumps({
                    "type": "echo",
                    "status": "not_implemented",
                    "received": data["text"],
                })
                await websocket.send_text(response)

    except WebSocketDisconnect:
        logger.info("[WS] Client disconnected from /ws/stream")
    except Exception as exc:
        logger.exception("[WS] Unexpected error in stream handler: %s", exc)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
