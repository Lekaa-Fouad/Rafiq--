"""
services/detection_service.py — Object Detection stub.

TO IMPLEMENT (teammate guide)
------------------------------
1. Install dependencies:
       pip install ultralytics

2. Load YOLOv8 at startup (main.py lifespan):
       from ultralytics import YOLO
       app.state.yolo_model = YOLO("yolov8n.pt")

3. Implement `detect_objects(image_bytes, yolo_model)`:
   a. Decode image_bytes with OpenCV or PIL.
   b. Run: results = yolo_model(img_array, conf=0.4)
   c. For each detection in results[0].boxes:
      - Extract label (model.names[cls_id]), confidence, xyxy bbox.
      - Compute bbox area vs image area → 'near' if > 30%, 'mid' if > 10%, else 'far'.
   d. Sort objects left-to-right by x1 coordinate.
   e. Generate spoken_summary: join descriptions in natural language.
      E.g. "I see a chair on the left, a door ahead, and a table on the right."
   f. Return DetectionResponse.

4. Follow the same error-handling pattern as voice_service.py.
   Raise RafiqException on failures.

Reference: voice_service.transcribe_audio() for error handling pattern.
"""

import logging

logger = logging.getLogger(__name__)


async def detect_objects(_image_bytes: bytes, _yolo_model=None) -> dict:
    """
    [STUB] Detect objects in an image using YOLOv8.

    See module docstring for full implementation instructions.
    """
    logger.info("[DETECTION] detect_objects called — stub, not yet implemented")
    return {"status": "not_implemented"}
