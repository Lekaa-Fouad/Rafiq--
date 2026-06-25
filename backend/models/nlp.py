"""
models/nlp_models.py
--------------------
Pydantic models (schemas) for the NLP module of the Rafiq project.

These models serve three purposes:
1. Request validation  — FastAPI uses them to parse and validate incoming JSON.
2. Response shaping    — They define the exact JSON contract returned to callers.
3. Documentation       — FastAPI auto-generates OpenAPI docs from these definitions.

Separation principle:
    These are pure data-contract models. No business logic lives here.
    The service layer (services/nlp_service.py) owns the NLPResult dataclass,
    which is an internal transfer object — not exposed directly to the API.
"""

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Request Models
# ---------------------------------------------------------------------------

class NLPRequest(BaseModel):
    """
    Payload accepted by POST /nlp/.

    Sent by the frontend or the STT (Whisper) pipeline.
    """

    text: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Arabic text to analyse — typically the output of the STT module.",
        examples=["وديني المطبخ", "سجل لقاء", "فين الباب"],
    )
    session_id: Optional[str] = Field(
        default=None,
        description=(
            "Optional Dialogflow session ID. "
            "Enables multi-turn conversation context. "
            "A random UUID is generated per request when omitted."
        ),
        examples=["rafiq-user-42", None],
    )

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        """Reject strings that are whitespace-only after stripping."""
        if not value.strip():
            raise ValueError("text must not be blank or whitespace-only.")
        return value

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "text": "وديني المطبخ",
                    "session_id": None,
                },
                {
                    "text": "سجل لقاء",
                    "session_id": "rafiq-user-42",
                },
            ]
        }
    }


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------

class NLPResponse(BaseModel):
    """
    Successful response returned by POST /nlp/ (HTTP 200 OK).

    Example for the command "وديني المطبخ":
        {
            "intent":           "NAVIGATE",
            "confidence":       0.9731,
            "parameters":       { "location": "المطبخ" },
            "fulfillment_text": "",
            "raw_query":        "وديني المطبخ"
        }
    """

    intent: str = Field(
        ...,
        description="Display name of the detected Dialogflow intent.",
        examples=["NAVIGATE", "CALL_CONTACT", "OPEN_DOOR"],
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Intent detection confidence score returned by Dialogflow (0.0 – 1.0).",
        examples=[0.9731],
    )
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Key-value pairs of entities extracted from the utterance. "
            "Empty dict when no parameters were detected."
        ),
        examples=[{"location": "المطبخ"}, {"contact_name": "لقاء"}],
    )
    fulfillment_text: str = Field(
        default="",
        description=(
            "Optional text response configured in the Dialogflow agent. "
            "Empty string when no fulfillment message is set."
        ),
        examples=["جاري التنقل إلى المطبخ", ""],
    )
    raw_query: str = Field(
        ...,
        description="The cleaned text that was actually sent to Dialogflow.",
        examples=["وديني المطبخ"],
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "intent": "NAVIGATE",
                    "confidence": 0.9731,
                    "parameters": {"location": "المطبخ"},
                    "fulfillment_text": "",
                    "raw_query": "وديني المطبخ",
                },
                {
                    "intent": "CONTACT",
                    "confidence": 0.9512,
                    "parameters": {"contact_name": "لقاء"},
                    "fulfillment_text": "جاري  تسجيل لقاء",
                    "raw_query": "سجل لقاء",
                },
            ]
        }
    }


# ---------------------------------------------------------------------------
# Error Response Models
# ---------------------------------------------------------------------------

class NLPErrorDetail(BaseModel):
    """
    Body of a structured error response.

    Used by HTTPException handlers and custom error middleware.
    Kills all error responses in a consistent shape.
    """

    detail: str = Field(
        ...,
        description="Human-readable explanation of what went wrong.",
        examples=["text must not be blank or whitespace-only."],
    )
    code: str = Field(
        ...,
        description=(
            "Machine-readable error code for the frontend to act on. "
            "Follows the pattern: DOMAIN_ERROR_TYPE."
        ),
        examples=["NLP_EMPTY_TEXT", "NLP_UPSTREAM_ERROR", "NLP_INTERNAL_ERROR"],
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "detail": "text must not be blank or whitespace-only.",
                    "code": "NLP_EMPTY_TEXT",
                },
                {
                    "detail": "Could not reach the Dialogflow service. Please try again.",
                    "code": "NLP_UPSTREAM_ERROR",
                },
            ]
        }
    }