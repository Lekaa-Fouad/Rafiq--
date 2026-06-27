"""
ws/live_detection.py — WebSocket handler for real-time object detection.

Route:  /ws/live-detection?api_key=<key>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Design intent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use this endpoint when the mobile app needs **continuous, real-time**
obstacle detection while the user is walking (camera streams client-side).

Use POST /detection/process-frame for **one-shot** detection on a single
uploaded image (e.g. user taps a button to scan a scene).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Frame format (Client → Server)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Send raw JPEG bytes as binary WebSocket messages.

WHY BINARY OVER BASE64:
  Base64 inflates payload by ~33% and requires encode/decode on both ends.
  Binary frames skip all of that — lower latency, less CPU, less battery.
  React Native's WebSocket API supports binary via ArrayBuffer natively.

RECOMMENDED CLIENT SEND RATE: 2–5 fps.
  Reason: YOLO + MiDaS inference takes ~200–500 ms per frame on CPU.
  Sending faster wastes bandwidth; the server drops excess frames anyway
  (see Backpressure section below). On GPU inference is ~30–80 ms — 10 fps
  would then be reasonable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Message format (Server → Client)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every server message is a JSON text message with a "type" field:

  1. Handshake confirmation (sent once on connect):
     {
       "type": "connected",
       "message": "Live detection ready. Send JPEG frames as binary messages.",
       "recommended_fps": 3
     }

  2. Per-frame detection result:
     {
       "type": "detection",
       "frame_id": 42,               ← monotonic counter; discard if out-of-order
       "timestamp": 1782222798.26,   ← server time.time() after processing
       "success": true,
       "detections": [
         {
           "object_id": 1,
           "object_name": "person",
           "confidence": 0.94,
           "direction": "in front of you",  ← "on your left" | "in front of you" | "on your right"
           "distance": "very close",         ← "very close" | "close" | "medium distance" | "far"
           "distance_m": 0.56,
           "motion": "static",               ← "static" | "moving left" | "moving right"
           "speech": "person in front of you, very close (0.56 m)",
           "bbox": [100, 50, 300, 400]       ← [x1, y1, x2, y2] in pixels
         }
       ],
       "message": "2 object(s) detected",
       "spoken_message": "person in front of you, very close. dog on your left, close"
     }

  3. Non-fatal error (bad frame — connection stays open):
     {
       "type": "error",
       "frame_id": 43,
       "fatal": false,
       "message": "Could not decode frame — expected JPEG bytes.",
       "spoken_message": null
     }

  4. Fatal error (server-side crash — connection closes with code 1011):
     {
       "type": "error",
       "frame_id": 43,
       "fatal": true,
       "message": "Internal detection error: ...",
       "spoken_message": null
     }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Backpressure: "latest frame wins"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Two async tasks run concurrently:
  _receiver  — reads frames from the WS and puts them in a 1-slot queue.
  _processor — takes frames from the slot and runs detection.

If a new frame arrives while the slot is full (i.e. the processor is still
running on the previous frame), the OLD frame is discarded and the NEW one
takes its place. This means:
  - No backpressure queue build-up.
  - No stale detections — the user always hears about what's in front NOW.
  - Detection results may not cover every frame sent (fine for navigation).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auth
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pass the API key as a query parameter — browsers and React Native's built-in
WebSocket API do NOT support custom headers on the initial handshake.

  Connect: ws://host:8000/ws/live-detection?api_key=change-me-in-production

The connection is rejected with code 4001 before accept() if the key is wrong.
"""

import asyncio
import json
import logging
import time

import cv2
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from core.config import get_settings
from services.detection_service import DetectionService

logger = logging.getLogger(__name__)
settings = get_settings()

# Module-level service instance (stateful tracker — one per process)
_detection_service = DetectionService()

# Sentinel value used to signal the processor task to stop
_STOP = object()


async def live_detection_handler(websocket: WebSocket) -> None:
    """
    WebSocket handler for /ws/live-detection.

    Lifecycle:
      1. Validate API key from query param — reject with code 4001 if invalid.
      2. Accept connection and send "connected" handshake message.
      3. Spawn two concurrent tasks: _receiver and _processor.
      4. On client disconnect or server error, cancel both tasks and exit.
    """
    # ── Auth ──────────────────────────────────────────────────────────────────
    api_key = websocket.query_params.get("api_key", "")
    if api_key != settings.API_KEY:
        logger.warning("[WS/LIVE] Rejected connection — invalid API key")
        await websocket.close(code=4001, reason="Invalid or missing api_key query parameter.")
        return

    await websocket.accept()
    logger.info("[WS/LIVE] Client connected from %s", websocket.client)

    # ── Handshake ─────────────────────────────────────────────────────────────
    await websocket.send_text(json.dumps({
        "type": "connected",
        "message": "Live detection ready. Send JPEG frames as binary messages.",
        "recommended_fps": 3,
    }))

    # ── Shared single-slot frame buffer ───────────────────────────────────────
    # maxsize=1 → "latest frame wins" backpressure strategy
    frame_slot: asyncio.Queue = asyncio.Queue(maxsize=1)
    frame_id = 0

    # ── Task 1: receive frames from the WebSocket ─────────────────────────────
    async def _receiver() -> None:
        try:
            while True:
                data = await websocket.receive()

                # Client sent a binary frame
                if "bytes" in data and data["bytes"]:
                    raw = data["bytes"]
                    # Drop the old frame if the slot is full (latest wins)
                    if frame_slot.full():
                        try:
                            frame_slot.get_nowait()
                            logger.debug("[WS/LIVE] Dropped stale frame (backpressure)")
                        except asyncio.QueueEmpty:
                            pass
                    await frame_slot.put(raw)

                # Client disconnected via close frame
                elif data.get("type") == "websocket.disconnect":
                    logger.info("[WS/LIVE] Client sent disconnect frame")
                    break

        except WebSocketDisconnect:
            logger.info("[WS/LIVE] Client disconnected (WebSocketDisconnect)")
        except Exception as exc:
            logger.exception("[WS/LIVE] Receiver error: %s", exc)
        finally:
            # Always unblock the processor so it can exit cleanly
            await frame_slot.put(_STOP)

    # ── Task 2: process frames and send detection results ─────────────────────
    async def _processor() -> None:
        nonlocal frame_id

        app_state = websocket.app.state
        yolo_model       = app_state.yolo_model
        midas_model      = app_state.midas_model
        midas_transforms = app_state.midas_transforms
        device           = app_state.device

        loop = asyncio.get_event_loop()

        while True:
            item = await frame_slot.get()

            # Sentinel → receiver has stopped; exit cleanly
            if item is _STOP:
                break

            frame_id += 1
            frame_bytes: bytes = item

            # ── Decode JPEG ───────────────────────────────────────────────────
            try:
                nparr = np.frombuffer(frame_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if frame is None:
                    raise ValueError("Could not decode image — expected JPEG bytes.")
            except Exception as exc:
                logger.warning("[WS/LIVE] Bad frame %d: %s", frame_id, exc)
                await _send_error(websocket, frame_id, fatal=False, message=str(exc))
                continue

            # ── Run YOLO + MiDaS in a thread (blocking CPU work) ─────────────
            try:
                events = await loop.run_in_executor(
                    None,
                    _detection_service.process_frame,
                    frame,
                    yolo_model,
                    midas_model,
                    midas_transforms,
                    device,
                )
            except Exception as exc:
                logger.exception("[WS/LIVE] Detection failed on frame %d: %s", frame_id, exc)
                await _send_error(websocket, frame_id, fatal=False,
                                  message=f"Detection error: {exc}")
                continue

            # ── Build and send response ───────────────────────────────────────
            try:
                # Priority speech: speak the 3 closest/most relevant objects
                spoken = ". ".join(
                    e.speech for e in
                    sorted(events, key=lambda e: e.distance_m)[:3]
                ) if events else ""

                response = {
                    "type": "detection",
                    "frame_id": frame_id,
                    "timestamp": time.time(),
                    "success": True,
                    "detections": [e.model_dump() for e in events],
                    "message": f"{len(events)} object(s) detected",
                    "spoken_message": spoken,
                }
                await websocket.send_text(json.dumps(response))
                logger.debug("[WS/LIVE] Frame %d → %d detection(s)", frame_id, len(events))

            except Exception as exc:
                logger.exception("[WS/LIVE] Failed to send frame %d result: %s", frame_id, exc)
                break  # Can't send → exit processor

    # ── Run both tasks concurrently ───────────────────────────────────────────
    receiver_task  = asyncio.create_task(_receiver())
    processor_task = asyncio.create_task(_processor())

    try:
        # Wait for either task to finish (whichever exits first)
        done, pending = await asyncio.wait(
            [receiver_task, processor_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Cancel the other task
        for task in pending:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    except Exception as exc:
        logger.exception("[WS/LIVE] Unexpected error in task group: %s", exc)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except Exception:
            pass

    logger.info("[WS/LIVE] Session ended (frame_id=%d)", frame_id)


async def _send_error(
    websocket: WebSocket,
    frame_id: int,
    fatal: bool,
    message: str,
) -> None:
    """Send a structured error JSON message over the WebSocket."""
    try:
        await websocket.send_text(json.dumps({
            "type": "error",
            "frame_id": frame_id,
            "fatal": fatal,
            "message": message,
            "spoken_message": None,
        }))
    except Exception:
        pass  # If we can't even send the error, swallow it
