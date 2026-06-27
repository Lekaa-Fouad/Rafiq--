/**
 * src/services/index.ts
 * Barrel re-exports for all Rafiq services.
 *
 * Services (Phase 2 — enhanced):
 *   apiClient          — Axios instance with envelope unwrap + typed errors
 *   faceService        — Face register, identify, list, delete
 *   voiceService       — STT transcription, TTS synthesis (file URI)
 *   detectionSocket    — WebSocket client for live detection
 *   navigationService  — Indoor navigation (stub)
 *
 * Legacy API clients (Phase 1 — kept for backward compatibility):
 *   api/client, api/voice, api/face, api/detection, api/navigation, api/ocr, api/health
 */

// ── Phase 2 services (preferred) ──────────────────────────────────────────────

// API client + error class
export { apiClient, API_URL, API_KEY, RafiqApiError } from './apiClient';

// Face recognition
export {
  registerFace,
  identifyFace,
  listFaces,
  deleteFace,
} from './faceService';

// Voice (STT + TTS)
export {
  transcribeAudio,
  synthesizeSpeech,
} from './voiceService';

// Live object detection WebSocket
export { DetectionSocket } from './detectionSocket';
export type { DetectionSocketState } from './detectionSocket';

// Indoor navigation (stub)
export {
  registerRoom,
  getDirections,
} from './navigationService';

// Intent routing (Phase 3)
export {
  classifyIntent,
  describeIntent,
  getSpokenConfirmation,
} from './intentRouter';
export type {
  Intent,
  IntentType,
} from './intentRouter';

// ── Types re-exports for convenience ──────────────────────────────────────────

export type {
  FaceRegisterResponse,
  FaceIdentifyResponse,
  FaceListItem,
  FaceDeleteResponse,
} from '../types/face';

export type {
  STTResponse,
  TTSOptions,
} from '../types/voice';

export type {
  DetectionObject,
  WSDetectionMessage,
  WSConnectedMessage,
  WSErrorMessage,
  WSServerMessage,
  DetectionSocketOptions,
} from '../types/detection';

export type {
  RoomDetails,
  NavigationStep,
  NavigationDirections,
} from '../types/navigation';
