/**
 * src/services/faceService.ts
 * Face recognition service — register, identify, list, delete.
 * Uses the enhanced apiClient with automatic envelope unwrapping.
 */

import { apiClient } from './apiClient';
import type {
  FaceRegisterResponse,
  FaceIdentifyResponse,
  FaceListItem,
} from '../types/face';

/**
 * Register a new face with a name.
 *
 * @param imageUri  Local file URI of the portrait photo (from camera or picker)
 * @param name      Person's name (1–100 characters)
 * @returns The registered face record with face_id
 */
export async function registerFace(
  imageUri: string,
  name: string,
  onProgress?: (message: string) => void,
): Promise<FaceRegisterResponse> {
  const formData = new FormData();
  formData.append('name', name.trim());
  formData.append('image', {
    uri: imageUri,
    name: 'portrait.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);

  // Provide real-time feedback
  if (onProgress) {
    onProgress('Uploading image...');
  }

  try {
    const response = await apiClient.post<FaceRegisterResponse>(
      '/face/register',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000, // Face embedding computation can take 30-60s on CPU
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total ?? 1),
            );
            onProgress(`Uploading: ${percentCompleted}%`);
          }
        },
      },
    );

    if (onProgress) {
      onProgress('Face registered successfully!');
    }
    return response.data;
  } catch (error) {
    if (onProgress) {
      onProgress('Registration failed. Please try again.');
    }
    throw error;
  }
}

/**
 * Identify a person from a photo.
 *
 * @param imageUri  Local file URI of the photo to identify
 * @returns Identification result with name, confidence, distance
 */
export async function identifyFace(
  imageUri: string,
): Promise<FaceIdentifyResponse> {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    name: 'identify.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);

  const response = await apiClient.post<FaceIdentifyResponse>(
    '/face/identify',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000, // Face identification can take 30-60s on CPU
    },
  );
  return response.data;
}

/**
 * List all registered face profiles.
 *
 * @returns Array of registered face records
 */
export async function listFaces(): Promise<FaceListItem[]> {
  const response = await apiClient.get<FaceListItem[]>('/face/list');
  return response.data;
}

/**
 * Delete a face profile by UUID.
 *
 * @param id  UUID of the face record to delete
 */
export async function deleteFace(id: string): Promise<void> {
  await apiClient.delete(`/face/${id}`);
}
