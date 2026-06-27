/**
 * src/api/face.ts
 * API functions for face recognition endpoints.
 *
 * Endpoints (verified against backend/routers/face.py):
 *   POST   /face/register  — multipart: name (text) + image (file) → JSON
 *   POST   /face/identify  — multipart: image (file) → JSON
 *   GET    /face/list      — no body → JSON
 *   DELETE /face/:face_id  — no body → JSON
 */

import { apiClient } from './client';
import type {
  RafiqResponse,
  FaceRegisterResponse,
  FaceIdentifyResponse,
  FaceListItem,
  FaceDeleteResponse,
} from '../types/api';

/**
 * Register a new face with a name.
 * @param name      Person's name (1–100 chars)
 * @param imageUri  Local file URI of the portrait photo
 * @param mimeType  Image MIME type (default 'image/jpeg')
 */
export async function registerFace(
  name: string,
  imageUri: string,
  mimeType: string = 'image/jpeg'
): Promise<RafiqResponse<FaceRegisterResponse>> {
  const formData = new FormData();
  formData.append('name', name.trim());
  formData.append('image', {
    uri: imageUri,
    name: 'portrait.jpg',
    type: mimeType,
  } as any);

  const response = await apiClient.post<RafiqResponse<FaceRegisterResponse>>(
    '/face/register',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

/**
 * Identify a person from a photo.
 * @param imageUri  Local file URI of the portrait photo
 * @param mimeType  Image MIME type
 */
export async function identifyFace(
  imageUri: string,
  mimeType: string = 'image/jpeg'
): Promise<RafiqResponse<FaceIdentifyResponse>> {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    name: 'identify.jpg',
    type: mimeType,
  } as any);

  const response = await apiClient.post<RafiqResponse<FaceIdentifyResponse>>(
    '/face/identify',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

/**
 * List all registered face profiles.
 */
export async function listFaces(): Promise<RafiqResponse<FaceListItem[]>> {
  const response = await apiClient.get<RafiqResponse<FaceListItem[]>>('/face/list');
  return response.data;
}

/**
 * Delete a face profile by UUID.
 * @param faceId  UUID of the face record to delete
 */
export async function deleteFace(faceId: string): Promise<RafiqResponse<FaceDeleteResponse>> {
  const response = await apiClient.delete<RafiqResponse<FaceDeleteResponse>>(`/face/${faceId}`);
  return response.data;
}
