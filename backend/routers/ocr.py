import logging

from fastapi import APIRouter, Depends, File, HTTPException, status, UploadFile
from fastapi.responses import Response

from core.dependencies import verify_api_key
from core.responses import RafiqResponse, success_response
from models.ocr import OCRResponseData
from services import voice_service
from services.ocr_service import ocr_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ocr",
    tags=["OCR"],
    dependencies=[Depends(verify_api_key)],
)


# ── helpers ────────────────────────────────────────────────────────────────────

def _assert_image(file: UploadFile) -> None:
    """Raise 422 if the uploaded file is not an image."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file must be an image.",
        )


# ── OCR only ───────────────────────────────────────────────────────────────────

@router.post(
    "",
    summary="Optical Character Recognition — extract text from image",
    response_model=RafiqResponse,
    responses={
        200: {"description": "Successful text extraction.", "model": OCRResponseData},
        401: {"description": "Invalid or missing API key."},
        422: {"description": "Uploaded file must be a valid image."},
    },
)
async def extract_text_from_image(
    file: UploadFile = File(..., description="Image file to extract text from (png, jpg, jpeg)."),
):
    """
    Upload any image containing Arabic or English text and receive structured text data.
    """
    logger.info("[OCR] — file: %s", file.filename)
    _assert_image(file)

    try:
        contents = await file.read()
        ocr_results = ocr_service.extract_text(contents)

        return success_response(
            data={
                "annotations": ocr_results["annotations"],
                "full_text": ocr_results["full_text"],
            },
            message="Text extracted successfully.",
            spoken_message=ocr_results["full_text"] or "No text detected.",
        )
    except Exception as exc:
        logger.exception("[OCR] Processing failed.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR processing failed: {exc}",
        ) from exc


# ── OCR → Voice ────────────────────────────────────────────────────────────────

@router.post(
    "/to-voice",
    summary="OCR to Speech — extract text and download synthesised MP3",
    response_class=Response,
    responses={
        200: {
            "description": "MP3 audio file containing the spoken image text.",
            "content": {"audio/mpeg": {}},
        },
        401: {"description": "Invalid or missing API key."},
        422: {"description": "Uploaded file must be a valid image."},
        500: {"description": "OCR or speech-synthesis pipeline failed."},
    },
)
async def extract_text_and_speak(
    file: UploadFile = File(..., description="Image file to read out loud (png / jpg / jpeg)."),
):
    """
    Convert image text directly to speech and download the result as an MP3 file.
    """
    logger.info("[OCR] /to-voice — file: %s", file.filename)
    _assert_image(file)

    try:
        contents = await file.read()
        ocr_results = ocr_service.extract_text(contents)
        full_text = ocr_results["full_text"].strip() or "No text detected in the image."

        audio_bytes, voice_used, mime_type = await voice_service.synthesise_speech(
            text=full_text,
            voice=None,
            rate=None,
            language=None,
        )

        return Response(
            content=audio_bytes,
            media_type=mime_type,
            headers={
                "Content-Disposition": 'attachment; filename="ocr_speech.mp3"',
                "X-Voice-Used": voice_used,
                "X-Audio-Size": str(len(audio_bytes)),
            },
        )
    except Exception as exc:
        logger.exception("[OCR] /to-voice pipeline failed.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR to Voice pipeline failed: {exc}",
        ) from exc