from typing import List

from pydantic import BaseModel, Field


class OCRAnnotation(BaseModel):
    """A single detected text region with its confidence score."""

    text: str = Field(..., description="The recognised text string.")
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Detection confidence (0.0 – 1.0)."
    )

    model_config = {
        "json_schema_extra": {
            "examples": [{"text": "مرحبا", "confidence": 0.97}]
        }
    }


class OCRResponseData(BaseModel):
    """Structured payload returned by the OCR endpoints."""

    annotations: List[OCRAnnotation] = Field(
        ...,
        description="Per-region breakdown of every detected text block.",
    )
    full_text: str = Field(
        ...,
        description="All detected text joined into a single string.",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "annotations": [
                        {"text": "مرحبا", "confidence": 0.97},
                        {"text": "Hello", "confidence": 0.95},
                    ],
                    "full_text": "مرحبا Hello",
                }
            ]
        }
    }