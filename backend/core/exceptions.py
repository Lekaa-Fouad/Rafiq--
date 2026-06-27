"""
core/exceptions.py — Custom exception hierarchy for the Rafiq backend.

Services MUST raise these exceptions (never raw Python exceptions).
The global handler in main.py converts every RafiqException into the
standard error response shape automatically.
"""


class RafiqException(Exception):
    """Base exception for all Rafiq domain errors."""

    def __init__(
        self,
        message: str,
        spoken_message: str = "Something went wrong. Please try again.",
        status_code: int = 500,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.spoken_message = spoken_message
        self.status_code = status_code


# ── Voice Exceptions ──────────────────────────────────────────────────────────

class AudioProcessingError(RafiqException):
    """Raised when audio transcription or synthesis fails."""

    def __init__(self, message: str) -> None:
        super().__init__(
            message=message,
            spoken_message="I couldn't process the audio. Please try again.",
            status_code=422,
        )


# ── Face Recognition Exceptions ───────────────────────────────────────────────

class FaceNotFoundError(RafiqException):
    """Raised when no face is detected in the provided image."""

    def __init__(self) -> None:
        super().__init__(
            message="No face detected in the provided image.",
            spoken_message="I couldn't detect a face in the image. Please try again with a clearer photo.",
            status_code=422,
        )


class FaceAlreadyRegisteredError(RafiqException):
    """Raised when a face with the same name already exists in the database."""

    def __init__(self, name: str) -> None:
        super().__init__(
            message=f"A face profile for '{name}' is already registered.",
            spoken_message=f"{name} is already registered.",
            status_code=409,
        )


# ── Model / Infrastructure Exceptions ────────────────────────────────────────

class ModelLoadError(RafiqException):
    """Raised when an AI model fails to load at startup."""

    def __init__(self, model_name: str, detail: str) -> None:
        super().__init__(
            message=f"Failed to load model '{model_name}': {detail}",
            spoken_message="The AI service is temporarily unavailable. Please try again later.",
            status_code=503,
        )
