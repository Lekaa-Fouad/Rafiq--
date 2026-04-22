"""
models/detection.py — Pydantic models for the Object Detection module (stub).

TO IMPLEMENT:
  Use ultralytics YOLOv8. Load model once at startup into app.state.yolo_model.
  Call model(img_array, conf=0.4). Map results to DetectedObject list.
  Generate spoken_summary by sorting objects left-to-right by bbox x1 and
  describing them in natural language.
"""

from typing import List
from pydantic import BaseModel, Field


class BBox(BaseModel):
    """Pixel coordinates of a detection bounding box."""

    x1: float
    y1: float
    x2: float
    y2: float
    width: float
    height: float


class DetectedObject(BaseModel):
    """A single detected object from YOLO inference."""

    label: str = Field(..., description="COCO class label, e.g. 'chair', 'person'.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detection confidence score.")
    bbox: BBox = Field(..., description="Bounding box pixel coordinates.")
    distance_hint: str = Field(
        ...,
        description="Rough distance estimate: 'near', 'mid', or 'far' — derived from bbox area.",
    )


class DetectionResponse(BaseModel):
    """Full object detection result for a submitted image."""

    objects: List[DetectedObject] = Field(default_factory=list)
    object_count: int = Field(..., description="Total number of detected objects.")
    spoken_summary: str = Field(
        ...,
        description="Natural language summary, e.g. 'I see a chair on your left and a door ahead.'",
    )
    processing_time_ms: float = Field(..., description="Server-side processing time in milliseconds.")
