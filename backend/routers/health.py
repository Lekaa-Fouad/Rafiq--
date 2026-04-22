"""
routers/health.py — Basic health/status endpoint.
"""

from fastapi import APIRouter, Request

from core.responses import RafiqResponse, success_response

router = APIRouter(prefix="/health", tags=["Health"])


@router.get(
    "",
    summary="Service health check",
    response_model=RafiqResponse[dict],
)
async def health_check(request: Request):
    redis_client = getattr(request.app.state, "redis", None)
    whisper_model = getattr(request.app.state, "whisper_model", None)
    return success_response(
        data={
            "status": "ok",
            "redis_connected": redis_client is not None,
            "whisper_loaded": whisper_model is not None,
        },
        message="Service is healthy.",
        spoken_message="Service is healthy.",
    )
