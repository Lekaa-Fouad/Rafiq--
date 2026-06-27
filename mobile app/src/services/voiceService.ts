/**
 * src/services/voiceService.ts
 * Voice service — STT transcription and TTS synthesis.
 *
 * STT: Sends audio to backend Faster-Whisper, returns transcript.
 * TTS: Sends text to backend Edge-TTS, receives MP3 bytes,
 *      writes to FileSystem cache dir, returns a local file URI
 *      ready for expo-av playback.
 */

import * as FileSystem from 'expo-file-system';
import { apiClient } from './apiClient';
import type { STTResponse, TTSOptions } from '../types/voice';

/**
 * Transcribe an audio file using the backend Faster-Whisper model.
 *
 * @param audioUri      Local file URI from expo-av recording (file:///...)
 * @param languageHint  Optional: 'ar' or 'en'. Omit for auto-detect.
 * @returns Transcription result with transcript, language, confidence, duration
 */
export async function transcribeAudio(
  audioUri: string,
  languageHint?: 'ar' | 'en',
): Promise<STTResponse> {
  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);

  if (languageHint) {
    formData.append('language', languageHint);
  }

  const response = await apiClient.post<STTResponse>(
    '/voice/stt',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return response.data;
}

/**
 * Synthesize speech from text via backend Edge-TTS.
 * Downloads the MP3 response, writes it to the FileSystem cache directory,
 * and returns a local file URI suitable for expo-av Sound playback.
 *
 * @param text  Text to synthesize (max 2000 characters)
 * @param opts  Optional voice, rate, and language settings
 * @returns Local file URI of the cached MP3 (e.g. file:///...cache/tts_<ts>.mp3)
 */
export async function synthesizeSpeech(
  text: string,
  opts?: TTSOptions,
): Promise<string> {
  const formData = new FormData();
  formData.append('text', text);
  if (opts?.voice) formData.append('voice', opts.voice);
  if (opts?.rate) formData.append('rate', opts.rate);
  if (opts?.language) formData.append('language', opts.language);

  const response = await apiClient.post('/voice/tts', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'arraybuffer',
  });

  // Write MP3 bytes to cache directory
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('FileSystem.cacheDirectory is not available');
  }

  const filename = `tts_${Date.now()}.mp3`;
  const fileUri = `${cacheDir}${filename}`;

  // Convert ArrayBuffer to base64 for FileSystem.writeAsStringAsync
  const bytes = new Uint8Array(response.data as ArrayBuffer);
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  const base64 = btoa(binary);

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return fileUri;
}
