/**
 * src/types/face.ts
 * TypeScript types for Face Recognition API responses.
 * Mirrors backend Pydantic schemas from backend/models/face.py.
 */

/** Response from POST /face/register */
export interface FaceRegisterResponse {
  face_id: string;
  name: string;
  message: string;
}

/** Response from POST /face/identify */
export interface FaceIdentifyResponse {
  identified: boolean;
  /** null if no match found */
  name: string | null;
  /** Confidence score 0.0–1.0 */
  confidence: number;
  /** null if no match found */
  face_id: string | null;
  /** Raw cosine distance; ≤ 0.40 = match */
  distance: number;
}

/** One item in the list from GET /face/list */
export interface FaceListItem {
  face_id: string;
  name: string;
  image_count: number;
  /** ISO 8601 datetime string */
  created_at: string;
}

/** Response from DELETE /face/{face_id} */
export interface FaceDeleteResponse {
  deleted: boolean;
  face_id: string;
}
