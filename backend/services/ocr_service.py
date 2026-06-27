"""
services/ocr_service.py — OCR stub.

TO IMPLEMENT (teammate guide)
------------------------------
1. Install dependencies:
       pip install paddlepaddle paddleocr

2. Load PaddleOCR at startup:
       from paddleocr import PaddleOCR
       app.state.ocr_engine = PaddleOCR(use_angle_cls=True, lang='en')

3. Implement `run_ocr(image_bytes, redis)`:
   a. Decode image_bytes with OpenCV.
   b. Call app.state.ocr_engine.ocr(img_array, cls=True).
   c. Flatten results into BoundingBox list.
   d. Compute mean confidence; join text lines.
   e. Cache result in Redis: rafiq:ocr:{sha256(image_bytes)}, TTL 600s.
   f. Return OCRResponse.

4. Follow the same try/except pattern as voice_service.py.
   Raise RafiqException on all failures, never raw exceptions.

Reference: voice_service.transcribe_audio() for the caching pattern.
"""

import logging

logger = logging.getLogger(__name__)


async def run_ocr(_image_bytes: bytes, _redis) -> dict:
    """
    [STUB] Extract text from an image using PaddleOCR.

    See module docstring for full implementation instructions.
    """
    logger.info("[OCR] run_ocr called — stub, not yet implemented")
    return {"status": "not_implemented"}
