/**
 * src/types/detection.ts
 * TypeScript types for the live detection WebSocket protocol.
 * Mirrors backend models/detection.py and ws/live_detection.py message shapes.
 */

// ── Server → Client messages ──────────────────────────────────────────────────

/** Sent once immediately after WebSocket connection is accepted */
export interface WSConnectedMessage {
  type: 'connected';
  message: string;
  recommended_fps: number;
}

/** A single detected object within a frame */
export interface DetectionObject {
  object_id: number;
  object_name: string;
  confidence: number;
  /** "on your left" | "in front of you" | "on your right" */
  direction: string;
  /** "very close" | "close" | "medium distance" | "far" */
  distance: string;
  /** Estimated distance in meters */
  distance_m: number;
  /** "static" | "moving left" | "moving right" */
  motion: string;
  /** Pre-built spoken description of this object */
  speech: string;
  /** Bounding box [x1, y1, x2, y2] in pixels */
  bbox: [number, number, number, number] | null;
}

/** Detection result for a processed frame */
export interface WSDetectionMessage {
  type: 'detection';
  frame_id: number;
  timestamp: number;
  success: boolean;
  detections: DetectionObject[];
  message: string;
  /** Top-3 closest objects joined with '. ' — ready for TTS */
  spoken_message: string;
}

/** Error message (non-fatal or fatal) */
export interface WSErrorMessage {
  type: 'error';
  frame_id: number;
  /** If true, the connection will close with code 1011 */
  fatal: boolean;
  message: string;
  spoken_message: string | null;
}

/** Union of all possible server messages */
export type WSServerMessage = WSConnectedMessage | WSDetectionMessage | WSErrorMessage;

// ── Client-side detection socket options ──────────────────────────────────────

export interface DetectionSocketOptions {
  /** Target frames per second for send throttling (default: 3) */
  targetFps?: number;
  /** Maximum auto-reconnect attempts (default: 3) */
  maxReconnectAttempts?: number;
  /** Called when connected / reconnected */
  onConnected?: (msg: WSConnectedMessage) => void;
  /** Called on each detection result */
  onDetection?: (msg: WSDetectionMessage) => void;
  /** Called on error messages from server */
  onError?: (msg: WSErrorMessage) => void;
  /** Called when connection closes (final) */
  onDisconnected?: (code: number, reason: string) => void;
  /** Called when a reconnect attempt starts */
  onReconnecting?: (attempt: number, maxAttempts: number) => void;
}
