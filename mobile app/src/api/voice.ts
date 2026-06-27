/**
 * src/api/voice.ts
 * API functions for voice endpoints.
 *
 * Endpoints (verified against backend/routers/voice.py):
 *   POST /voice/stt — multipart/form-data, returns JSON RafiqResponse<STTResponse>
 *   POST /voice/tts — multipart/form-data, returns raw audio/mpeg bytes
 */

import { apiClient } from './client';
import type { RafiqResponse, STTResponse } from '../types/api';

// ── Speech-to-Text ────────────────────────────────────────────────────────────

/**
 * Transcribe an audio file using the backend Faster-Whisper model.
 *
 * @param audioUri    Local file URI from expo-av recording (e.g. file:///...)
 * @param audioBlob   The audio as a Blob or Uint8Array
 * @param mimeType    MIME type, e.g. 'audio/m4a', 'audio/wav'
 * @param language    Optional: 'ar' or 'en'. Omit for auto-detect.
 */
export async function transcribeAudio(
  audioUri: string,
  mimeType: string = 'audio/m4a',
  language?: 'ar' | 'en'
): Promise<RafiqResponse<STTResponse>> {
  const formData = new FormData();

  // React Native FormData accepts { uri, name, type } objects
  formData.append('audio', {
    uri: audioUri,
    name: 'recording.m4a',
    type: mimeType,
  } as any);

  if (language) {
    formData.append('language', language);
  }

  const response = await apiClient.post<RafiqResponse<STTResponse>>('/voice/stt', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
}

// ── Text-to-Speech ────────────────────────────────────────────────────────────

/**
 * Convert text to speech via backend Edge-TTS.
 * Returns raw MP3 bytes as an ArrayBuffer — caller is responsible for playback.
 *
 * @param text      Text to speak (max 2000 chars)
 * @param voice     Optional Edge-TTS voice name
 * @param rate      Optional rate offset e.g. '+10%'
 * @param language  Optional 'ar' or 'en'
 */
export async function synthesiseSpeech(
  text: string,
  voice?: string,
  rate?: string,
  language?: 'ar' | 'en'
): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append('text', text);
  if (voice) formData.append('voice', voice);
  if (rate) formData.append('rate', rate);
  if (language) formData.append('language', language);

  const response = await apiClient.post('/voice/tts', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'arraybuffer',
  });

  return response.data;
}
