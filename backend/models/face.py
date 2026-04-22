from typing import Optional
from pydantic import BaseModel, Field


class FaceRegisterResponse(BaseModel):
    """Result of successfully registering a new face profile."""

    face_id: str = Field(..., description="UUID of the newly created face record.")
    name: str = Field(..., description="The name stored with this face profile.")
    message: str = Field(..., description="Human-readable confirmation.")


class FaceIdentifyResponse(BaseModel):
    """Result of a face identification attempt."""

    identified: bool = Field(..., description="True if a known face was matched.")
    name: Optional[str] = Field(None, description="Name of the matched person, if identified.")
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Confidence score derived from cosine distance (1 − distance)."
    )
    face_id: Optional[str] = Field(None, description="UUID of the matched face record.")
    distance: float = Field(..., description="Raw cosine distance; lower is closer (≤ 0.40 = match).")


class FaceListItem(BaseModel):
    """Summary of a registered face (no embedding bytes)."""

    face_id: str = Field(..., description="UUID of the face record.")
    name: str = Field(..., description="Display name for this person.")
    image_count: int = Field(..., description="Number of images registered for this person.")
    created_at: str = Field(..., description="ISO timestamp when the face was first registered.")


class FaceDeleteResponse(BaseModel):
    """Result of a face deletion request."""

    deleted: bool = Field(..., description="True if the record was found and removed.")
    face_id: str = Field(..., description="UUID of the deleted face record.")
