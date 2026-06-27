import { apiClient } from '../services/apiClient';
import type { DetectionObject } from '../types/detection';

/**
 * Send an image to the object detection endpoint.
 *
 * @param imageUri  Local file URI of the camera frame / photo
 * @param mimeType  Image MIME type
 */
export async function detectObjects(
  imageUri: string,
  mimeType: string = 'image/jpeg'
): Promise<{ status: string; detections: DetectionObject[] }> {
  const formData = new FormData();
  formData.append('file', {
    uri: imageUri,
    name: 'detect_frame.jpg',
    type: mimeType,
  } as any);

  const response = await apiClient.post(
    '/detection/process-frame',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}
