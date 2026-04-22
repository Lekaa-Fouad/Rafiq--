"""
models/navigation.py — Pydantic models for the Indoor Navigation module (stub).

TO IMPLEMENT:
  Use ArUco marker detection (cv2.aruco). Detect visible markers in frame,
  match against stored map, compute direction and distance to destination
  using Euclidean distance between marker positions.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class MarkerPosition(BaseModel):
    """A single ArUco marker with its position and semantic label."""

    marker_id: int = Field(..., description="ArUco marker integer ID.")
    x: float = Field(..., description="X coordinate in the map coordinate system.")
    y: float = Field(..., description="Y coordinate in the map coordinate system.")
    label: str = Field(..., description="Semantic label, e.g. 'entrance' or 'room_101'.")


class MapUploadRequest(BaseModel):
    """Payload for uploading or updating an indoor map."""

    map_id: str = Field(..., description="Unique identifier for this map (e.g. building slug).")
    markers: List[MarkerPosition] = Field(..., description="All known markers in this map.")


class NavigationRequest(BaseModel):
    """Request for a single navigation instruction."""

    map_id: str = Field(..., description="ID of the map to navigate.")
    current_marker_id: int = Field(..., description="ArUco ID of the marker currently visible.")
    destination_label: str = Field(..., description="Semantic label of the destination marker.")


class NavigationResponse(BaseModel):
    """A single navigation step instruction."""

    instruction: str = Field(..., description="Short directional instruction, e.g. 'Turn left and walk 10 steps.'")
    spoken_instruction: str = Field(..., description="The instruction formatted for TTS playback.")
    next_marker_id: Optional[int] = Field(None, description="ArUco ID of the next waypoint marker.")
    distance_meters: float = Field(..., description="Estimated distance to the next waypoint in metres.")
