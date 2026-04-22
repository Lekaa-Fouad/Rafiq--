"""
routers/detection.py — Object Detection endpoint stub.

TO IMPLEMENT
------------
See `services/detection_service.py` for the full implementation guide.

Quick summary:
  1. pip install ultralytics
  2. Load YOLOv8 at startup: app.state.yolo_model = YOLO("yolov8n.pt")
  3. Replace stub body with `detection_service.detect_objects(image_bytes, yolo_model)`
  4. Return RafiqResponse[DetectionResponse] with the real result.

Follow the same patterns as `routers/voice.py`.
"""

import logging

from fastapi import APIRouter, Depends, File, UploadFile

from core.dependencies import verify_api_key
from core.responses import RafiqResponse, success_response

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/detect",
    tags=["Object Detection"],
    dependencies=[Depends(verify_api_key)],
)


@router.post(
    "",
    summary="Detect objects in image (YOLOv8) — coming soon",
    response_model=RafiqResponse[dict],
    responses={
        200: {"description": "Stub response — not yet implemented."},
        401: {"description": "Invalid or missing API key."},
    },
)
async def detect_objects(
    image: UploadFile = File(..., description="Image file to run object detection on."),
):
    """
    ## Object Detection

    **[STUB — Not yet implemented]**

    ### Planned behaviour
    - Accept a JPEG/PNG image upload.
    - Run **YOLOv8n** inference at confidence threshold 0.4.
    - For each detected object:
      - Extract label (COCO class name), confidence, bounding box (x1,y1,x2,y2).
      - Estimate distance: 'near' (bbox area > 30% of image), 'mid' (> 10%), 'far' otherwise.
    - Sort objects left-to-right by x1 coordinate.
    - Generate `spoken_summary` in natural language:
      e.g. "I see a chair on your left and a door ahead."
    - Return DetectionResponse with full object list and summary.

    ### Implementation steps
    See `services/detection_service.py` for the step-by-step guide.

    ### Expected response model
    ```python
    class DetectionResponse(BaseModel):
        objects: List[DetectedObject]
        object_count: int
        spoken_summary: str
        processing_time_ms: float
    ```
    """
    logger.info("[DETECTION] Stub endpoint called")
    return success_response(
        data={"status": "not_implemented"},
        message="Object detection endpoint is not yet implemented.",
        spoken_message="This feature is coming soon.",
    )
