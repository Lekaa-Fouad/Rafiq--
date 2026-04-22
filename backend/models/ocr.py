"""
models/ocr.py — Pydantic models for the OCR module (stub).

TO IMPLEMENT:
  Use PaddleOCR. Install: pip install paddlepaddle paddleocr.
  Call ocr_engine.ocr(img_array, cls=True).
  Map results to OCRResponse (text, language, confidence, bounding_boxes).
"""

from typing import List
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """Bounding box for a detected text region."""

    text: str = Field(..., description="Text content in this bounding box.")
    x: int = Field(..., description="Left pixel coordinate.")
    y: int = Field(..., description="Top pixel coordinate.")
    w: int = Field(..., description="Width in pixels.")
    h: int = Field(..., description="Height in pixels.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Per-word confidence score.")


class OCRResponse(BaseModel):
    """Full OCR result for a submitted image."""

    text: str = Field(..., description="Full extracted text, lines joined with newlines.")
    language: str = Field(..., description="Detected language code.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Mean confidence across all words.")
    bounding_boxes: List[BoundingBox] = Field(
        default_factory=list,
        description="Per-word bounding boxes with text and coordinates.",
    )
    processing_time_ms: float = Field(..., description="Server-side processing time in milliseconds.")
