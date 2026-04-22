"""
routers/ocr.py — OCR endpoint stub.

TO IMPLEMENT
------------
See `services/ocr_service.py` for the full implementation guide.

Quick summary:
  1. pip install paddlepaddle paddleocr
  2. Load OCR engine at startup: app.state.ocr_engine = PaddleOCR(...)
  3. Replace the stub body with `ocr_service.run_ocr(image_bytes, redis)`
  4. Return RafiqResponse[OCRResponse] with the real result.

Follow the same patterns as `routers/voice.py`.
"""

import logging

from fastapi import APIRouter, Depends, File, UploadFile

from core.dependencies import verify_api_key
from core.responses import RafiqResponse, success_response

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ocr",
    tags=["OCR"],
    dependencies=[Depends(verify_api_key)],
)


@router.post(
    "",
    summary="Extract text from image (OCR) — coming soon",
    response_model=RafiqResponse[dict],
    responses={
        200: {"description": "Stub response — not yet implemented."},
        401: {"description": "Invalid or missing API key."},
    },
)
async def run_ocr(
    image: UploadFile = File(..., description="Image file to extract text from."),
):
    """
    ## Optical Character Recognition (OCR)

    **[STUB — Not yet implemented]**

    ### Planned behaviour
    - Accept a JPEG/PNG image upload.
    - Extract all visible text using **PaddleOCR**.
    - Return the full text, per-word bounding boxes, confidence scores,
      detected language, and server-side processing time.
    - Cache results in Redis: `rafiq:ocr:{sha256(image_bytes)}` TTL 600 s.

    ### Implementation steps
    See `services/ocr_service.py` for the full step-by-step guide.

    ### Expected response model
    ```python
    class OCRResponse(BaseModel):
        text: str
        language: str
        confidence: float
        bounding_boxes: List[BoundingBox]
        processing_time_ms: float
    ```
    """
    logger.info("[OCR] Stub endpoint called")
    return success_response(
        data={"status": "not_implemented"},
        message="OCR endpoint is not yet implemented.",
        spoken_message="This feature is coming soon.",
    )
