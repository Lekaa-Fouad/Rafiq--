/**
 * src/types/voice.ts
 * TypeScript types for Voice (STT/TTS) API responses.
 * Mirrors backend Pydantic schemas from backend/models/voice.py.
 */

/** Response from POST /voice/stt (unwrapped from envelope) */
export interface STTResponse {
  transcript: string;
  language: string;
  /** Confidence score 0.0–1.0 */
  confidence: number;
  duration_seconds: number;
}

/** Options for TTS synthesis */
export interface TTSOptions {
  /** Edge-TTS voice name, e.g. 'en-US-JennyNeural', 'ar-SA-ZariyahNeural' */
  voice?: string;
  /** Rate offset, e.g. '+10%', '-20%' */
  rate?: string;
  /** Language hint: 'ar' or 'en' — auto-detected if omitted */
  language?: 'ar' | 'en';
}
