import logging

from fastapi import APIRouter, HTTPException, status
from google.api_core.exceptions import GoogleAPICallError

from models.nlp import NLPRequest, NLPResponse, NLPErrorDetail
from services.nlp_service import NLPResult, nlp_service

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger("rafiq.routers.nlp")

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(
    prefix="/nlp",
    tags=["NLP Module"],
)

# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post(
    "/",
    response_model=NLPResponse,
    status_code=status.HTTP_200_OK,
    responses={
        422: {"model": NLPErrorDetail, "description": "Validation Error (e.g. Empty text)"},
        502: {"model": NLPErrorDetail, "description": "Dialogflow Upstream Error"},
        500: {"model": NLPErrorDetail, "description": "Internal Server Error"}
    },
    summary="Detect Intent from Arabic Text",
    description=(
        "Accepts Arabic text (typically from a speech-to-text module like Whisper), "
        "queries the Dialogflow ES agent, and returns the detected intent "
        "along with its extracted parameters."
    ),
)
def detect_intent(payload: NLPRequest) -> NLPResponse:
    """
    Core NLP endpoint for the Rafiq assistant.

    - **200 OK** — Intent successfully detected.
    - **422 Unprocessable Entity** — Request body failed validation.
    - **502 Bad Gateway** — Dialogflow API error.
    - **500 Internal Server Error** — Unexpected failure.
    """
    logger.info("POST /nlp/ — received text: '%s'", payload.text)

    try:
        # استدعاء السيرفيس
        result: NLPResult = nlp_service.detect_intent(
            text=payload.text,
            session_id=payload.session_id,
        )
    except ValueError as exc:
        logger.warning("Validation error in nlp_service: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=NLPErrorDetail(detail=str(exc), code="NLP_EMPTY_TEXT").model_dump(),
        ) from exc
    except GoogleAPICallError as exc:
        logger.error("Dialogflow API call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=NLPErrorDetail(
                detail="Could not reach the Dialogflow service. Please check your credentials.", 
                code="NLP_UPSTREAM_ERROR"
            ).model_dump(),
        ) from exc
    except RuntimeError as exc:
        logger.error("Runtime error in NLP pipeline: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=NLPErrorDetail(
                detail="An internal error occurred while processing your request.", 
                code="NLP_INTERNAL_ERROR"
            ).model_dump(),
        ) from exc

    return NLPResponse(
        intent=result.intent,
        confidence=result.confidence,
        parameters=result.parameters,
        fulfillment_text=result.fulfillment_text,
        raw_query=result.raw_query,
    )