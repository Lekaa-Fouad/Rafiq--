"""
routers/ws.py — WebSocket router.

Routes
------
  /ws/stream          — generic stream stub (to be implemented by team)
  /ws/live-detection  — real-time YOLO+MiDaS object detection from mobile camera
"""

from fastapi import APIRouter, WebSocket

from ws.stream import stream_handler
from ws.live_detection import live_detection_handler

router = APIRouter(
    prefix="/ws",
    tags=["WebSocket"],
)


@router.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    """
    ## WebSocket Stream

    **[STUB — Not yet implemented]**

    Real-time binary frame stream from the mobile app.
    See `ws/stream.py` for full implementation instructions.

    Connect with: `ws://host:8000/ws/stream`
    """
    await stream_handler(websocket)


@router.websocket("/live-detection")
async def websocket_live_detection(websocket: WebSocket):
    """
    ## Live Object Detection Stream  🎥→🧠→🔊

    Real-time obstacle detection for visually impaired users walking with
    the Rafiq mobile app. The **client** streams camera frames; the server
    runs YOLO + MiDaS per frame and pushes back spoken-ready JSON results.

    ---

    ### When to use this vs POST /detection/process-frame

    | | POST /detection/process-frame | WS /ws/live-detection |
    |---|---|---|
    | **Use case** | One-shot scan (user taps a button) | Continuous detection while walking |
    | **Camera** | Client uploads a saved image | Client streams live frames |
    | **Latency** | One round-trip per request | Persistent connection, low overhead |
    | **Best for** | Scene description, QR, text | Obstacle avoidance, navigation |

    ---

    ### Authentication

    WebSocket handshakes do not support custom headers.
    Pass your API key as a **query parameter**:

    ```
    ws://host:8000/ws/live-detection?api_key=change-me-in-production
    ```

    Connection is rejected with **code 4001** if the key is missing or wrong.

    ---

    ### Client → Server message format

    Send each camera frame as a **binary WebSocket message** containing raw
    JPEG bytes. No JSON wrapper needed.

    **Why binary, not base64?**
    Base64 inflates payload ~33% and requires encode/decode on both sides.
    Binary frames have zero overhead. React Native supports `ArrayBuffer`
    natively.

    **Recommended send rate: 2–5 fps.**
    YOLO + MiDaS takes ~200–500 ms per frame on CPU. Sending faster wastes
    bandwidth — the server silently drops excess frames (see Backpressure).

    ---

    ### Server → Client message format

    All messages are JSON text. Check the `"type"` field first.

    **1. Handshake (sent once on connect)**
    ```json
    {
      "type": "connected",
      "message": "Live detection ready. Send JPEG frames as binary messages.",
      "recommended_fps": 3
    }
    ```

    **2. Detection result (sent after each processed frame)**
    ```json
    {
      "type": "detection",
      "frame_id": 42,
      "timestamp": 1782222798.26,
      "success": true,
      "detections": [
        {
          "object_id": 1,
          "object_name": "person",
          "confidence": 0.94,
          "direction": "in front of you",
          "distance": "very close",
          "distance_m": 0.56,
          "motion": "static",
          "speech": "person in front of you, very close (0.56 m)",
          "bbox": [100, 50, 300, 400]
        }
      ],
      "message": "1 object(s) detected",
      "spoken_message": "person in front of you, very close"
    }
    ```

    `spoken_message` contains the top-3 closest objects joined with `. `
    — ready to pass directly to a TTS engine on the mobile side.

    `bbox` is `[x1, y1, x2, y2]` in pixels relative to the sent frame.
    Use it for visual overlay or distance prioritisation.

    Use `frame_id` to discard out-of-order results on the client.

    **3. Non-fatal error (bad frame — connection stays open)**
    ```json
    {
      "type": "error",
      "frame_id": 43,
      "fatal": false,
      "message": "Could not decode frame — expected JPEG bytes.",
      "spoken_message": null
    }
    ```

    **4. Fatal error (server crash — connection closes with code 1011)**
    ```json
    { "type": "error", "frame_id": 43, "fatal": true, "message": "..." }
    ```

    ---

    ### Backpressure — "latest frame wins"

    Two tasks run concurrently per connection:
    - **Receiver** reads frames from the socket into a 1-slot buffer.
    - **Processor** pulls from the buffer and runs YOLO + MiDaS.

    If a new frame arrives while the processor is still busy, the old frame
    is silently discarded and the new one takes its place. This guarantees:
    - No stale detections (the user always hears about what is in front NOW).
    - No unbounded queue growth under heavy load.
    - Detection results may skip frames — this is intentional.

    ---

    ### Minimal React Native / Expo client example

    ```typescript
    import { useRef, useEffect } from 'react';
    import { Camera, CameraView } from 'expo-camera';

    const WS_URL = 'ws://192.168.1.10:8000/ws/live-detection?api_key=change-me-in-production';
    const SEND_INTERVAL_MS = 333; // ~3 fps

    export function useLiveDetection(onDetection: (msg: any) => void) {
      const wsRef = useRef<WebSocket | null>(null);
      const cameraRef = useRef<CameraView | null>(null);
      const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

      useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => console.log('[WS] Connected');

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'detection') {
            onDetection(msg);
            // Example: speak the closest object
            // Tts.speak(msg.spoken_message);
          }
        };

        ws.onerror = (e) => console.warn('[WS] Error', e);
        ws.onclose = (e) => console.log('[WS] Closed', e.code, e.reason);

        // Send frames at controlled interval
        timerRef.current = setInterval(async () => {
          if (!cameraRef.current || ws.readyState !== WebSocket.OPEN) return;
          try {
            const photo = await cameraRef.current.takePictureAsync({
              quality: 0.4,       // lower quality = smaller payload
              base64: true,       // expo gives us base64; decode to binary
              skipProcessing: true,
            });
            if (!photo?.base64) return;
            // Convert base64 → ArrayBuffer and send as binary
            const binary = Uint8Array.from(atob(photo.base64), c => c.charCodeAt(0));
            ws.send(binary.buffer);
          } catch (err) {
            console.warn('[WS] Frame capture error', err);
          }
        }, SEND_INTERVAL_MS);

        return () => {
          if (timerRef.current) clearInterval(timerRef.current);
          ws.close();
        };
      }, []);

      return cameraRef;
    }
    ```

    ---

    ### Distance estimation

    Each frame uses **MiDaS** (monocular depth estimation) to produce a
    per-pixel depth map, then samples the depth within each YOLO bounding box.
    The same `DetectionService.process_frame()` function used by the HTTP
    endpoint is called here — no duplicated detection logic.
    """
    await live_detection_handler(websocket)

