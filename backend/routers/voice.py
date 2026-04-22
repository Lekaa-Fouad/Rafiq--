import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response

from core.dependencies import verify_api_key
from core.exceptions import AudioProcessingError
from core.responses import RafiqResponse, success_response
from models.voice import STTResponse
from services import voice_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/voice",
    tags=["Voice"],
    dependencies=[Depends(verify_api_key)],
)


# ── STT ───────────────────────────────────────────────────────────────────────

@router.post(
    "/stt",
    summary="Speech-to-Text — transcribe uploaded audio",
    response_model=RafiqResponse[STTResponse],
    responses={
        200: {"description": "Successful transcription."},
        401: {"description": "Invalid or missing API key."},
        422: {"description": "Could not process the audio (empty, corrupt, or no speech)."},
        503: {"description": "Whisper model not loaded."},
    },
)
async def speech_to_text(
    request: Request,
    audio: UploadFile = File(..., description="Audio file for transcription (wav, mp3, m4a, ogg, …)."),
    language: Optional[str] = Form(
        None,
        description="ISO language hint: 'ar' or 'en'. Leave blank for auto-detect.",
    ),
):
    """
    Upload any audio file and receive a text transcription.

    - **audio**: multipart audio file (wav / mp3 / m4a / ogg / flac)
    - **language** *(optional form field)*: `ar` or `en` — leave blank for auto-detect
    """
    logger.info("[VOICE] /stt — file: %s, language hint: %s", audio.filename, language)

    try:    
        audio_bytes = await audio.read()
    except Exception as exc:
        raise AudioProcessingError(f"Failed to read uploaded audio: {exc}") from exc

    whisper_model = request.app.state.whisper_model

    result = await voice_service.transcribe_audio(
        audio_bytes=audio_bytes,
        whisper_model=whisper_model,
        language=language,
    )

    return success_response(
        data=STTResponse(
            transcript=result["transcript"],
            language=result["language"],
            confidence=result["confidence"],
            duration_seconds=result["duration_seconds"],
        ),
        message="Audio transcribed successfully.",
        spoken_message=result["transcript"] or "No speech detected.",
    )


# ── TTS ───────────────────────────────────────────────────────────────────────

@router.post(
    "/tts",
    summary="Text-to-Speech — download synthesised MP3",
    response_class=Response,
    responses={
        200: {
            "description": "MP3 audio file download.",
            "content": {"audio/mpeg": {}},
        },
        401: {"description": "Invalid or missing API key."},
        422: {"description": "TTS synthesis failed or empty text."},
        503: {"description": "edge-tts unavailable."},
    },
)
async def text_to_speech(
    text: str = Form(..., min_length=1, max_length=2000, description="Text to synthesise."),
    voice: Optional[str] = Form(
        None,
        description="Edge-TTS voice name, e.g. 'en-US-JennyNeural' or 'ar-SA-ZariyahNeural'.",
    ),
    rate: Optional[str] = Form(
        None,
        description="Speed offset, e.g. '+10%' or '-20%'. Defaults to '+0%'.",
    ),
    language: Optional[str] = Form(
        None,
        description="Force language: 'ar' or 'en'. Auto-detected from text if omitted.",
    ),
):
    """
    Convert text to speech and **download** the result as an **MP3 file**.

    Send as `multipart/form-data`:
    - **text** *(required)*: The text to speak (up to 2000 characters).
    - **voice** *(optional)*: `en-US-JennyNeural` (default EN) / `ar-SA-ZariyahNeural` (default AR).
    - **rate** *(optional)*: `+0%` to `+50%` (faster) or `-50%` to `+0%` (slower).
    - **language** *(optional)*: `ar` / `en` — auto-detected if omitted.

    The response is a downloadable **audio/mpeg** file.
    """
    logger.info("[VOICE] /tts — chars: %d, voice: %s, rate: %s", len(text), voice, rate)

    audio_bytes, voice_used, mime_type = await voice_service.synthesise_speech(
        text=text,
        voice=voice,
        rate=rate,
        language=language,
    )

    return Response(
        content=audio_bytes,
        media_type=mime_type,
        headers={
            "Content-Disposition": 'attachment; filename="speech.mp3"',
            "X-Voice-Used": voice_used,
            "X-Audio-Size": str(len(audio_bytes)),
        },
    )
