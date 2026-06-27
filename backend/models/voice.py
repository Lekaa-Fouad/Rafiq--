from typing import Optional
from pydantic import BaseModel, Field


class STTResponse(BaseModel):
    """Result of a Speech-to-Text transcription."""

    transcript: str = Field(..., description="Full transcribed text.")
    language: str = Field(..., description="Detected language code, e.g. 'en' or 'ar'.")
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Mean confidence score (0.0 – 1.0)."
    )
    duration_seconds: float = Field(..., description="Duration of the audio clip in seconds.")


class TTSRequest(BaseModel):
    """Body for the Text-to-Speech endpoint."""

    text: str = Field(..., min_length=1, max_length=2000, description="Text to synthesise.")
    voice: Optional[str] = Field(
        None,
        description="Edge-TTS voice name, e.g. 'en-US-JennyNeural'. Overrides the default.",
    )
    rate: Optional[str] = Field(
        None,
        description="Speech rate offset, e.g. '+10%' or '-20%'. Defaults to TTS_DEFAULT_RATE.",
    )
    language: Optional[str] = Field(
        None,
        description=(
            "Force language: 'ar' or 'en'. "
            "If None the service auto-detects from Unicode character ranges."
        ),
    )


class TTSResponse(BaseModel):
    """Metadata returned alongside (or instead of) streaming TTS audio."""

    audio_url: str = Field(
        "",
        description="Reserved for future use in non-streaming mode.",
    )
    duration_seconds: float = Field(..., description="Approximate duration of the audio.")
    voice_used: str = Field(..., description="The Edge-TTS voice that was used.")
    cache_hit: bool = Field(..., description="True if the audio was served from Redis cache.")
