"""
core/responses.py — Unified JSON response wrapper for all Rafiq endpoints.

Every REST endpoint must return a RafiqResponse instance created via
`success_response()` or `error_response()`. This guarantees that every
API response has the same four-field shape expected by the mobile app.
"""

from typing import Generic, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class RafiqResponse(BaseModel, Generic[T]):
    """
    Standard envelope for every Rafiq API response.

    Fields
    ------
    success        : True on 2xx, False on any error.
    data           : The actual payload. None on error.
    message        : Human-readable status for developers/logs.
    spoken_message : What the mobile app reads aloud to the user.
    """

    success: bool
    data: Optional[T] = None
    message: str
    spoken_message: str


def success_response(
    data: T,
    message: str,
    spoken_message: str,
) -> RafiqResponse[T]:
    """Build a successful RafiqResponse envelope."""
    return RafiqResponse(
        success=True,
        data=data,
        message=message,
        spoken_message=spoken_message,
    )


def error_response(
    message: str,
    spoken_message: str = "Something went wrong. Please try again.",
) -> RafiqResponse[None]:
    """Build an error RafiqResponse envelope."""
    return RafiqResponse(
        success=False,
        data=None,
        message=message,
        spoken_message=spoken_message,
    )
