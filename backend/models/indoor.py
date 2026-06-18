"""
models/indoor.py — Pydantic schemas for Indoor Mapping.

Key concepts
------------
Each room MUST have:
  - A bounding box (x1, y1, x2, y2) — the 4 walls              [REQUIRED]
  - A door_side  — which wall the door is on: top/bottom/left/right  [REQUIRED]
  - A door_position — where on that wall: left/center/right    [default: center]

Door pixel is auto-calculated from bounds + door_side + door_position.
You may also supply an explicit `door` PixelPoint to override the calculation.

The path always goes:
  start_point → start_door → corridor_center → end_door → end_point

This ensures the navigation line never cuts through walls regardless
of where the user's start/end point is inside the room.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

# Position of the door along the wall:
#   top / bottom wall  →  left = left-third  |  center = middle  |  right = right-third
#   left / right wall  →  left = top-third   |  center = middle  |  right = bottom-third
DoorPosition = Literal["left", "center", "right"]


class PixelPoint(BaseModel):
    """A point on the floor plan image in pixel coordinates."""
    x: int = Field(..., description="Horizontal pixel from left.")
    y: int = Field(..., description="Vertical pixel from top.")


class RoomBounds(BaseModel):
    """
    The 4 walls of a room as a bounding box.
    (x1,y1) = top-left corner
    (x2,y2) = bottom-right corner
    """
    x1: int = Field(..., description="Left wall x coordinate.")
    y1: int = Field(..., description="Top wall y coordinate.")
    x2: int = Field(..., description="Right wall x coordinate.")
    y2: int = Field(..., description="Bottom wall y coordinate.")


def _calc_door(
    bounds: "RoomBounds",
    side: Literal["top", "bottom", "left", "right"],
    position: DoorPosition,
) -> "PixelPoint":
    """
    Calculate the door pixel from the room bounding box.

    Door offset fractions along the wall:
      left   -> 25% from the start of the wall
      center -> 50% (middle of the wall)
      right  -> 75% from the start of the wall
    """
    offset = {"left": 0.25, "center": 0.50, "right": 0.75}[position]

    if side == "top":
        return PixelPoint(
            x=int(bounds.x1 + (bounds.x2 - bounds.x1) * offset),
            y=bounds.y1,
        )
    elif side == "bottom":
        return PixelPoint(
            x=int(bounds.x1 + (bounds.x2 - bounds.x1) * offset),
            y=bounds.y2,
        )
    elif side == "left":
        return PixelPoint(
            x=bounds.x1,
            y=int(bounds.y1 + (bounds.y2 - bounds.y1) * offset),
        )
    else:  # right
        return PixelPoint(
            x=bounds.x2,
            y=int(bounds.y1 + (bounds.y2 - bounds.y1) * offset),
        )


class IndoorLocation(BaseModel):
    """A named room or location on the floor plan."""

    id: str = Field(..., description="Unique ID, e.g. 'room-101'.")
    name: str = Field(..., description="Display name, e.g. 'Room 101'.")

    # Where the user is / the route start-end dot on the map.
    # Can be anywhere inside the room (corner, center, etc.)
    point: PixelPoint = Field(
        ...,
        description="Any point inside the room (corner, center, etc.).",
    )

    # ── Room perimeter (REQUIRED) ─────────────────────────────────────────────
    bounds: RoomBounds = Field(
        ...,
        description="Room walls as bounding box (x1,y1,x2,y2). Required.",
    )

    # ── Door wall (REQUIRED) ──────────────────────────────────────────────────
    door_side: Literal["top", "bottom", "left", "right"] = Field(
        ...,
        description="Which wall the door is on: top / bottom / left / right.",
    )

    # ── Door position along that wall (defaults to center) ───────────────────
    door_position: DoorPosition = Field(
        "center",
        description=(
            "Where on the wall the door sits: "
            "'left' (25%%), 'center' (50%%), or 'right' (75%%) along the wall."
        ),
    )

    # Optional exact pixel override — takes priority over the calculated position
    door: Optional[PixelPoint] = Field(
        None,
        description=(
            "Exact door pixel coordinate (optional). "
            "If omitted, calculated from bounds + door_side + door_position."
        ),
    )

    category: str = Field(
        "room",
        description="Category: room, exit, stairs, elevator, toilet, other.",
    )

    area_m2: Optional[float] = Field(
        None,
        description="Room area in square metres.",
    )

    def computed_door(self) -> PixelPoint:
        """
        Return the actual door pixel coordinate.

        Uses the explicit `door` override if set; otherwise calculates the
        door position from bounds + door_side + door_position.
        """
        if self.door:
            return self.door
        return _calc_door(self.bounds, self.door_side, self.door_position)


class FloorPlan(BaseModel):
    """A saved floor plan with its rooms."""

    id: str
    name: str
    image_url: str
    width: int
    height: int
    corridor_y: int = Field(
        300,
        description="Y coordinate of the corridor centre line.",
    )
    locations: List[IndoorLocation] = Field(default_factory=list)


class SaveFloorPlanRequest(BaseModel):
    """Request to save a new floor plan."""

    name: str
    corridor_y: int = Field(300, description="Y coordinate of corridor centre.")
    locations: List[IndoorLocation] = Field(default_factory=list)

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Building A - Floor 1",
                "corridor_y": 300,
                "locations": [
                    {
                        "id": "room-101",
                        "name": "Room 101",
                        "point": {"x": 115, "y": 140},
                        "bounds": {"x1": 30, "y1": 30, "x2": 200, "y2": 250},
                        "door_side": "bottom",
                        "door_position": "center",
                        "category": "room",
                        "area_m2": 8.5,
                    },
                    {
                        "id": "room-102",
                        "name": "Room 102",
                        "point": {"x": 320, "y": 140},
                        "bounds": {"x1": 220, "y1": 30, "x2": 420, "y2": 250},
                        "door_side": "bottom",
                        "door_position": "left",
                        "category": "room",
                        "area_m2": 12.0,
                    },
                ],
            }
        }
    }


class IndoorRouteRequest(BaseModel):
    """Request to find a path between two locations."""

    floor_plan_id: str
    from_location_id: Optional[str] = Field(
        None,
        description="Starting location ID. Optional when query_text is provided.",
    )
    to_location_id: Optional[str] = Field(
        None,
        description="Destination location ID. Optional when query_text is provided.",
    )
    query_text: Optional[str] = Field(
        None,
        description=(
            "Natural-language route request, for example: '"
            "I am in room one and I want to go to room three'."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "floor_plan_id": "abc12345",
                "from_location_id": "room-101",
                "to_location_id": "main-exit",
                "query_text": "I am in room one and I want to go to room three",
            }
        }
    }


class IndoorRouteStep(BaseModel):
    """One step in the indoor navigation directions."""

    instruction: str
    distance_meters: float


class IndoorRouteResponse(BaseModel):
    """The indoor route result."""

    floor_plan_id: str
    floor_plan_name: str
    from_location: IndoorLocation
    to_location: IndoorLocation
    path: List[PixelPoint] = Field(
        ...,
        description="Ordered pixel points to draw on the floor plan.",
    )
    steps: List[IndoorRouteStep]
    total_distance_meters: float
    speech: str
    processing_time_ms: float


class VoiceRouteResponse(BaseModel):
    """
    Response for the voice-driven indoor route endpoint.

    Combines the STT transcript, the resolved route, and the TTS audio URL
    so the client can display what was heard and immediately play directions.
    """

    transcript: str = Field(
        ...,
        description="The text that was transcribed from the user's audio.",
    )
    detected_language: str = Field(
        ...,
        description="Language detected by the STT engine, e.g. 'en' or 'ar'.",
    )
    route: IndoorRouteResponse = Field(
        ...,
        description="The resolved indoor route (path, steps, speech, etc.).",
    )
