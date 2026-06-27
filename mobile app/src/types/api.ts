/**
 * src/types/api.ts
 * TypeScript types that exactly mirror the Rafiq backend Pydantic schemas.
 * Verified against: backend/models/voice.py, face.py, ocr.py, detection.py, navigation.py
 * and backend/core/responses.py
 */

// ── Standard Response Envelope ────────────────────────────────────────────────

export interface RafiqResponse<T> {
  success: boolean;
  data: T | null;
  message: string;
  spoken_message: string;
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface HealthData {
  status: string;
  redis_connected: boolean;
  whisper_loaded: boolean;
}

// ── Voice — STT ───────────────────────────────────────────────────────────────

/** Response from POST /voice/stt */
export interface STTResponse {
  transcript: string;
  language: string;
  confidence: number;       // 0.0 – 1.0
  duration_seconds: number;
}

// ── Voice — TTS ───────────────────────────────────────────────────────────────

/**
 * POST /voice/tts — Sends multipart form-data, receives raw MP3 bytes.
 * No JSON envelope. Response is audio/mpeg.
 */
export interface TTSRequest {
  text: string;              // required, max 2000 chars
  voice?: string;            // e.g. 'en-US-JennyNeural', 'ar-SA-ZariyahNeural'
  rate?: string;             // e.g. '+10%', '-20%'
  language?: 'ar' | 'en';   // auto-detected if omitted
}

// ── Face ──────────────────────────────────────────────────────────────────────

/** Response from POST /face/register */
export interface FaceRegisterResponse {
  face_id: string;
  name: string;
  message: string;
}

/** Response from POST /face/identify */
export interface FaceIdentifyResponse {
  identified: boolean;
  name: string | null;       // null if no match
  confidence: number;        // 0.0 – 1.0
  face_id: string | null;    // null if no match
  distance: number;          // raw cosine distance; ≤ 0.40 = match
}

/** One item in the list from GET /face/list */
export interface FaceListItem {
  face_id: string;
  name: string;
  image_count: number;
  created_at: string;        // ISO8601
}

/** Response from DELETE /face/:face_id */
export interface FaceDeleteResponse {
  deleted: boolean;
  face_id: string;
}

// ── OCR ───────────────────────────────────────────────────────────────────────

/** Response from POST /ocr */
export interface OCRAnnotation {
  text: string;
  confidence?: number;
  bbox?: number[][];
}

export interface OCRResponse {
  annotations: OCRAnnotation[];
  full_text: string;
}

/**
 * POST /ocr/to-voice — Sends image, receives raw MP3 bytes.
 * No JSON envelope. Response is audio/mpeg.
 */

// ── Object Detection ──────────────────────────────────────────────────────────

/** Planned schema from detection.py stub comments */
export interface DetectedObject {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];  // x1, y1, x2, y2
  position: 'near' | 'mid' | 'far';
}

export interface DetectionResponse {
  objects: DetectedObject[];
  object_count: number;
  spoken_summary: string;
  processing_time_ms: number;
}

// ── Indoor Navigation ─────────────────────────────────────────────────────────

/** Request body for POST /navigate/guide */
export interface NavigationRequest {
  map_id: string;
  current_marker_id: number;
  destination_label: string;
}

/** Planned response schema from navigation.py stub comments */
export interface NavigationResponse {
  instruction: string;
  spoken_instruction: string;
  next_marker_id: number;
  distance_meters: number;
}
