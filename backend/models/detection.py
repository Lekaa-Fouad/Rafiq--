"""
models/detection.py — Pydantic schemas for Object Detection.
"""

from typing import List, Optional
from pydantic import BaseModel


class TrackedObjectState(BaseModel):
    direction: str
    distance: str
    distance_m: float
    x: float
    time: float
    last_message: str


class DetectionEvent(BaseModel):
    timestamp: float
    object_id: int
    object_name: str
    confidence: float
    direction: str
    distance: str
    distance_m: float
    motion: str
    speech: str
    # Bounding box [x1, y1, x2, y2] in pixels — populated by the WS endpoint.
    # None in HTTP /process-frame responses (backward-compatible).
    bbox: Optional[List[int]] = None
