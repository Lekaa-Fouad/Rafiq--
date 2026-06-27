"""
services/voice_service.py — Business logic for Speech-to-Text (STT) and Text-to-Speech (TTS).

STT  : Uses faster-whisper (Whisper model loaded at startup → app.state.whisper_model)
TTS  : Uses edge-tts (Microsoft Edge neural voices) with automatic fallback to gTTS
       if edge-tts returns a 403 (Microsoft token rotation issue).

All public functions raise RafiqException subclasses, never raw exceptions.
"""

import io
import logging
import tempfile
import asyncio
from typing import Optional, Tuple

from core.config import get_settings
from core.exceptions import AudioProcessingError, RafiqException

logger = logging.getLogger(__name__)
settings = get_settings()


# ── Speech-to-Text ────────────────────────────────────────────────────────────

async def transcribe_audio(
    audio_bytes: bytes,
    whisper_model,
    language: Optional[str] = None,
) -> dict:
    """
    Transcribe audio bytes using the pre-loaded faster-whisper model.

    Parameters
    ----------
    audio_bytes   : Raw bytes of the uploaded audio file.
    whisper_model : The WhisperModel instance from app.state.whisper_model.
    language      : Optional ISO language hint (e.g. 'ar', 'en'). None = auto-detect.

    Returns
    -------
    dict with keys: transcript, language, confidence, duration_seconds
    """
    if whisper_model is None:
        raise RafiqException(
            message="Whisper model is not loaded. Check server startup logs.",
            spoken_message="Speech recognition is temporarily unavailable.",
            status_code=503,
        )

    if not audio_bytes:
        raise AudioProcessingError("Empty audio file received.")

    logger.info(
        "[STT] Starting transcription — %d bytes, language hint: %s",
        len(audio_bytes), language,
    )

    try:
        # faster-whisper needs a seekable file path. Write to a temp file.
        # On Windows, delete=True locks the file and prevents Whisper from
        # opening it by name — use delete=False and clean up manually instead.
        import os
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        try:
            tmp.write(audio_bytes)
            tmp.flush()
            tmp.close()  # Close so Whisper can open it on Windows

            transcribe_kwargs: dict = dict(
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
            )
            if language:
                transcribe_kwargs["language"] = language

            segments, info = whisper_model.transcribe(tmp.name, **transcribe_kwargs)
            segments = list(segments)  # materialise generator before file is deleted
        finally:
            try:
                os.unlink(tmp.name)  # Always delete the temp file
            except OSError:
                pass  # If already gone, that's fine

        if not segments:
            return {
                "transcript": "",
                "language": info.language,
                "confidence": float(info.language_probability),
                "duration_seconds": 0.0,
            }

        transcript = " ".join(seg.text.strip() for seg in segments).strip()
        duration = max(seg.end for seg in segments) if segments else 0.0

        logger.info(
            "[STT] Done — lang: %s, dur: %.2fs, text: '%s'",
            info.language, duration, transcript[:80],
        )

        return {
            "transcript": transcript,
            "language": info.language,
            "confidence": round(float(info.language_probability), 4),
            "duration_seconds": round(float(duration), 3),
        }

    except RafiqException:
        raise
    except Exception as exc:
        logger.exception("[STT] Transcription failed: %s", exc)
        raise AudioProcessingError(f"Transcription failed: {exc}") from exc



# ── Text-to-Speech ────────────────────────────────────────────────────────────

def _detect_language(text: str) -> str:
    """Heuristic: if >30 % of chars are Arabic Unicode → 'ar', else 'en'."""
    arabic_chars = sum(1 for ch in text if "\u0600" <= ch <= "\u06FF")
    return "ar" if arabic_chars > len(text) * 0.3 else "en"


# Edge-TTS voice names (Microsoft neural voices — high quality, free)
_EDGE_VOICE_MAP = {
    "ar": "ar-SA-ZariyahNeural",
    "en": "en-US-JennyNeural",
}

# gTTS language codes (Google Translate TTS — fallback)
_GTTS_LANG_MAP = {
    "ar": "ar",
    "en": "en",
}


async def _synthesise_edge_tts(
    text: str,
    voice: str,
    rate: str,
) -> bytes:
    """
    Synthesise with edge-tts, writing to a temp file to avoid stream truncation.
    Raises AudioProcessingError on failure so the caller can fall back.
    """
    try:
        import edge_tts  # noqa: PLC0415
    except ImportError as exc:
        raise AudioProcessingError("edge-tts is not installed.") from exc

    import os

    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)

    # Save to a temp file instead of streaming chunks — prevents audio being
    # cut off at the end on Windows when the stream closes prematurely.
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.close()
    try:
        await communicate.save(tmp.name)
        with open(tmp.name, "rb") as f:
            audio = f.read()
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    if not audio:
        raise AudioProcessingError("edge-tts returned empty audio. Voice name may be invalid.")
    return audio



def _synthesise_gtts(text: str, lang: str) -> bytes:
    """
    Synthesise with gTTS (Google Translate TTS). Synchronous — runs in-process.
    Returns MP3 bytes.
    """
    try:
        from gtts import gTTS  # noqa: PLC0415
    except ImportError as exc:
        raise AudioProcessingError("gTTS is not installed. Run: pip install gTTS") from exc

    tts = gTTS(text=text, lang=lang, slow=False)
    buf = io.BytesIO()
    tts.write_to_fp(buf)
    buf.seek(0)
    return buf.read()


async def synthesise_speech(
    text: str,
    voice: Optional[str] = None,
    rate: Optional[str] = None,
    language: Optional[str] = None,
) -> Tuple[bytes, str, str]:
    """
    Synthesise text to MP3 audio.

    Engine priority
    ---------------
    1. edge-tts  (Microsoft neural voices — highest quality)
       Falls back automatically if Microsoft returns 403 (token rotation).
    2. gTTS      (Google Translate TTS — reliable fallback)

    Parameters
    ----------
    text     : Text to convert to speech (1–2000 chars).
    voice    : edge-tts voice name override, e.g. 'en-US-JennyNeural'.
    rate     : Speed offset, e.g. '+10%' or '-20%'. Defaults to '+0%'.
    language : Force 'ar' or 'en'. Auto-detected from text if None.

    Returns
    -------
    (audio_bytes, voice_used_label, mime_type)
    """
    if not text or not text.strip():
        raise AudioProcessingError("Text must not be empty.")

    # Resolve language and voice
    detected_lang = language or _detect_language(text)
    effective_rate = rate or settings.TTS_DEFAULT_RATE

    if not voice:
        voice = _EDGE_VOICE_MAP.get(detected_lang, _EDGE_VOICE_MAP["en"])

    gtts_lang = _GTTS_LANG_MAP.get(detected_lang, "en")

    # ── Attempt 1: edge-tts ───────────────────────────────────────────────────
    logger.info("[TTS] Attempting edge-tts — voice: %s, rate: %s, chars: %d", voice, effective_rate, len(text))
    try:
        audio_bytes = await _synthesise_edge_tts(text, voice, effective_rate)
        logger.info("[TTS] edge-tts success — %d bytes", len(audio_bytes))
        return audio_bytes, voice, "audio/mpeg"

    except Exception as edge_exc:
        # 403 = Microsoft token expired/rotated; also catches other transient failures
        logger.warning(
            "[TTS] edge-tts failed (%s). Falling back to gTTS.", edge_exc
        )

    # ── Attempt 2: gTTS fallback ──────────────────────────────────────────────
    logger.info("[TTS] Using gTTS fallback — lang: %s", gtts_lang)
    try:
        audio_bytes = await asyncio.to_thread(_synthesise_gtts, text, gtts_lang)
        voice_label = f"gtts-{gtts_lang}"
        logger.info("[TTS] gTTS success — %d bytes", len(audio_bytes))
        return audio_bytes, voice_label, "audio/mpeg"

    except Exception as gtts_exc:
        logger.exception("[TTS] gTTS also failed: %s", gtts_exc)
        raise AudioProcessingError(
            f"All TTS engines failed. edge-tts error: {edge_exc}. gTTS error: {gtts_exc}"
        ) from gtts_exc
