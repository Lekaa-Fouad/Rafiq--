import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, status, UploadFile
from fastapi.responses import Response

from core.dependencies import verify_api_key
from core.responses import RafiqResponse, success_response
from models.ocr import OCRModel
from services import voice_service 

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ocr",
    tags=["OCR"],
    dependencies=[Depends(verify_api_key)], 
)

ocr_injector = OCRModel()

# ── ocr only (extract text from image) ──────────────────────────────────────────

@router.post(
    "",
    summary="Optical Character Recognition — extract text from image",
    response_model=RafiqResponse, 
    responses={
        200: {"description": "Successful text extraction."},
        401: {"description": "Invalid or missing API key."},
        422: {"description": "Uploaded file must be a valid image."},
    },
)
async def extract_text_from_image(
    file: UploadFile = File(..., description="Image file to extract text from (png, jpg, jpeg)."),
):
    """
    Upload any image file containing Arabic or English text and receive structural text data.
    """
    logger.info("[OCR] — file: %s", file.filename)

    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, 
            detail="Uploaded file must be an image."
        )
        
    try:
        contents = await file.read()
        ocr_results = ocr_injector.extract_text(contents)
        
        return success_response(
            data={
                "annotations": ocr_results["annotations"],
                "full_text": ocr_results["full_text"]
            },
            message="Text extracted successfully.",
            spoken_message=ocr_results["full_text"] or "No text detected."
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"OCR processing failed: {exc}"
        ) from exc


# ── ocr to voice (extract text and convert to speech) ──────────────────────────

@router.post(
    "/to-voice",
    summary="OCR to Speech — extract text and download synthesised MP3",
    response_class=Response,
    responses={
        200: {
            "description": "MP3 audio file download containing the image text.",
            "content": {"audio/mpeg": {}},
        },
        401: {"description": "Invalid or missing API key."},
        422: {"description": "Uploaded file must be a valid image or speech synthesis failed."},
    },
)
async def extract_text_and_speak(
    file: UploadFile = File(..., description="Image file to read out loud."),
):
    """
    Convert image text directly to speech and download the result as an MP3 file.

    - file: multipart image file (png / jpg / jpeg)
    
    The response is a downloadable audio/mpeg file.
    """
    logger.info("[OCR] /to-voice — file: %s", file.filename)

    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, 
            detail="Uploaded file must be an image."
        )
        
    try:
        contents = await file.read()
        ocr_results = ocr_injector.extract_text(contents)
        full_text = ocr_results["full_text"]
        
        if not full_text.strip():
            full_text = "No text detected in the image."
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"OCR to Voice pipeline failed: {exc}"
        ) from exc