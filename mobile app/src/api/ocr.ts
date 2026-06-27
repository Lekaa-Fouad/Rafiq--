/**
 * src/api/ocr.ts
 * API functions for OCR endpoints.
 *
 * Endpoints (verified against backend/routers/ocr.py):
 *   POST /ocr          — multipart: file (image) → JSON RafiqResponse<OCRResponse>
 *   POST /ocr/to-voice — multipart: file (image) → raw audio/mpeg bytes
 */

import { apiClient } from './client';
import type { RafiqResponse, OCRResponse } from '../types/api';

/**
 * Extract text from an image using EasyOCR.
 * @param imageUri  Local file URI
 * @param mimeType  Image MIME type (default 'image/jpeg')
 */
export async function extractText(
  imageUri: string,
  mimeType: string = 'image/jpeg'
): Promise<RafiqResponse<OCRResponse>> {
  const formData = new FormData();
  formData.append('file', {
    uri: imageUri,
    name: 'ocr_image.jpg',
    type: mimeType,
  } as any);

  const response = await apiClient.post<RafiqResponse<OCRResponse>>('/ocr', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

/**
 * Extract text from image AND get it as spoken MP3 audio in one call.
 * Returns raw MP3 bytes — play with expo-av.
 * @param imageUri  Local file URI
 * @param mimeType  Image MIME type
 */
export async function extractTextToSpeech(
  imageUri: string,
  mimeType: string = 'image/jpeg'
): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append('file', {
    uri: imageUri,
    name: 'ocr_image.jpg',
    type: mimeType,
  } as any);

  const response = await apiClient.post('/ocr/to-voice', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'arraybuffer',
  });
  return response.data;
}
