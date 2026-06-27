/**
 * src/services/detectionSocket.ts
 * WebSocket client for real-time object detection via /ws/live-detection.
 *
 * Features:
 *   - Client-side frame throttling (configurable target FPS, default 3)
 *   - "Drop stale frame" rule: if a send is in-flight, discard new frames
 *     rather than queueing — mirrors the server's 1-slot backpressure
 *   - Auto-reconnect with exponential backoff (max 3 retries by default)
 *   - Typed callbacks for connected, detection, error, and disconnect events
 *   - Frame ID tracking to discard out-of-order results
 *
 * Protocol:
 *   Client → Server: raw JPEG bytes as binary WebSocket messages
 *   Server → Client: JSON text messages (see types/detection.ts)
 *   Auth: API key passed as ?api_key= query parameter
 */

import { API_URL, API_KEY } from './apiClient';
import type {
  WSServerMessage,
  WSConnectedMessage,
  WSDetectionMessage,
  WSErrorMessage,
  DetectionSocketOptions,
} from '../types/detection';

// ── Connection states ─────────────────────────────────────────────────────────

export type DetectionSocketState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

// ── DetectionSocket class ─────────────────────────────────────────────────────

export class DetectionSocket {
  // ── Configuration ─────────────────────────────────────────────────────────
  private readonly wsUrl: string;
  private readonly targetFps: number;
  private readonly maxReconnectAttempts: number;
  private readonly minSendIntervalMs: number;

  // ── Callbacks ─────────────────────────────────────────────────────────────
  private onConnectedCb: ((msg: WSConnectedMessage) => void) | null = null;
  private onDetectionCb: ((msg: WSDetectionMessage) => void) | null = null;
  private onErrorCb: ((msg: WSErrorMessage) => void) | null = null;
  private onDisconnectedCb: ((code: number, reason: string) => void) | null = null;
  private onReconnectingCb: ((attempt: number, max: number) => void) | null = null;

  // ── Internal state ────────────────────────────────────────────────────────
  private ws: WebSocket | null = null;
  private _state: DetectionSocketState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  // ── Throttling state ──────────────────────────────────────────────────────
  private lastSendTime = 0;
  private sendInFlight = false;

  // ── Frame ordering ────────────────────────────────────────────────────────
  private lastReceivedFrameId = -1;

  constructor(options: DetectionSocketOptions = {}) {
    this.targetFps = options.targetFps ?? 3;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
    this.minSendIntervalMs = 1000 / this.targetFps;

    // Build WS URL from the REST API URL
    const httpUrl = API_URL.replace(/\/$/, '');
    const wsBase = httpUrl.replace(/^http/, 'ws');
    this.wsUrl = `${wsBase}/ws/live-detection?api_key=${encodeURIComponent(API_KEY)}`;

    // Register callbacks
    this.onConnectedCb = options.onConnected ?? null;
    this.onDetectionCb = options.onDetection ?? null;
    this.onErrorCb = options.onError ?? null;
    this.onDisconnectedCb = options.onDisconnected ?? null;
    this.onReconnectingCb = options.onReconnecting ?? null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Current connection state */
  get state(): DetectionSocketState {
    return this._state;
  }

  /** Whether the socket is connected and ready to send frames */
  get isConnected(): boolean {
    return this._state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Register a callback for detection results.
   * Can be called before or after connect().
   */
  onDetection(callback: (msg: WSDetectionMessage) => void): void {
    this.onDetectionCb = callback;
  }

  /**
   * Open the WebSocket connection.
   * If already connected, this is a no-op.
   */
  connect(): void {
    if (this._state === 'connected' || this._state === 'connecting') {
      return;
    }

    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this._connect();
  }

  /**
   * Close the WebSocket connection.
   * Stops auto-reconnect. Call connect() to restart.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this._cleanup();
    this._setState('disconnected');
  }

  /**
   * Send a JPEG frame to the server, respecting the throttle rate.
   * If less than (1000/targetFps) ms have passed since the last send,
   * the frame is silently dropped.
   *
   * @param jpegData  Raw JPEG bytes as a string (base64) or ArrayBuffer
   */
  sendFrame(jpegData: string | ArrayBuffer): void {
    if (!this.isConnected || !this.ws) return;

    const now = Date.now();
    if (now - this.lastSendTime < this.minSendIntervalMs) {
      // Throttled — too soon since last send
      return;
    }

    this.lastSendTime = now;
    this._doSend(jpegData);
  }

  /**
   * Send a JPEG frame with the "drop stale" rule:
   * If a previous send is still in-flight (waiting for a detection result),
   * this frame is discarded rather than queued.
   *
   * This mirrors the server's 1-slot backpressure — the client never
   * builds up a queue of outgoing frames.
   *
   * @param jpegData  Raw JPEG bytes as a string (base64) or ArrayBuffer
   */
  sendFrameThrottled(jpegData: string | ArrayBuffer): void {
    if (!this.isConnected || !this.ws) return;

    // Drop if in-flight
    if (this.sendInFlight) {
      return;
    }

    // Throttle by FPS
    const now = Date.now();
    if (now - this.lastSendTime < this.minSendIntervalMs) {
      return;
    }

    this.sendInFlight = true;
    this.lastSendTime = now;
    this._doSend(jpegData);
  }

  // ── Private: connection management ────────────────────────────────────────

  private _connect(): void {
    this._setState('connecting');

    try {
      this.ws = new WebSocket(this.wsUrl);
      // React Native's WebSocket supports binaryType
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        if (__DEV__) {
          console.log('[DetectionSocket] WebSocket connected');
        }
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event: WebSocketMessageEvent) => {
        this._handleMessage(event);
      };

      this.ws.onerror = (event: Event) => {
        if (__DEV__) {
          console.warn('[DetectionSocket] WebSocket error', event);
        }
      };

      this.ws.onclose = (event: { code?: number; reason?: string }) => {
        const code = event.code ?? 1006;
        const reason = event.reason ?? '';
        if (__DEV__) {
          console.log(`[DetectionSocket] WebSocket closed: ${code} ${reason}`);
        }
        this._handleClose(code, reason);
      };
    } catch (err) {
      if (__DEV__) {
        console.error('[DetectionSocket] Failed to create WebSocket', err);
      }
      this._handleClose(0, 'Connection failed');
    }
  }

  private _handleMessage(event: WebSocketMessageEvent): void {
    let msg: WSServerMessage;
    try {
      msg = JSON.parse(event.data as string) as WSServerMessage;
    } catch {
      if (__DEV__) {
        console.warn('[DetectionSocket] Failed to parse message', event.data);
      }
      return;
    }

    switch (msg.type) {
      case 'connected':
        this._setState('connected');
        this.onConnectedCb?.(msg);
        break;

      case 'detection':
        // Mark send as no longer in-flight
        this.sendInFlight = false;

        // Discard out-of-order frames
        if (msg.frame_id <= this.lastReceivedFrameId) {
          if (__DEV__) {
            console.log(`[DetectionSocket] Discarding out-of-order frame ${msg.frame_id}`);
          }
          return;
        }
        this.lastReceivedFrameId = msg.frame_id;
        this.onDetectionCb?.(msg);
        break;

      case 'error':
        // Mark send as no longer in-flight on error too
        this.sendInFlight = false;

        this.onErrorCb?.(msg);

        // Fatal errors close the connection
        if (msg.fatal) {
          this._cleanup();
          this._setState('disconnected');
          this.onDisconnectedCb?.(1011, msg.message);
        }
        break;
    }
  }

  private _handleClose(code: number, reason: string): void {
    this._cleanup();

    // Don't reconnect if we intentionally closed or auth was rejected
    if (this.intentionalClose || code === 4001) {
      this._setState('disconnected');
      this.onDisconnectedCb?.(code, reason);
      return;
    }

    // Auto-reconnect with exponential backoff
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10_000);

      if (__DEV__) {
        console.log(
          `[DetectionSocket] Reconnecting in ${delay}ms ` +
          `(attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
        );
      }

      this._setState('reconnecting');
      this.onReconnectingCb?.(this.reconnectAttempts, this.maxReconnectAttempts);

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this._connect();
      }, delay);
    } else {
      // Exhausted retries
      if (__DEV__) {
        console.log('[DetectionSocket] Max reconnect attempts reached');
      }
      this._setState('disconnected');
      this.onDisconnectedCb?.(code, reason || 'Max reconnect attempts exceeded');
    }
  }

  private _doSend(jpegData: string | ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    try {
      if (typeof jpegData === 'string') {
        // Assume base64 — decode to binary ArrayBuffer
        const binary = atob(jpegData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        this.ws.send(bytes.buffer);
      } else {
        // Already an ArrayBuffer — send directly
        this.ws.send(jpegData);
      }
    } catch (err) {
      if (__DEV__) {
        console.warn('[DetectionSocket] Failed to send frame', err);
      }
      this.sendInFlight = false;
    }
  }

  private _cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Remove handlers to prevent double-firing
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;

      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        try {
          this.ws.close();
        } catch {
          // Swallow close errors
        }
      }
      this.ws = null;
    }

    this.sendInFlight = false;
    this.lastReceivedFrameId = -1;
    this.lastSendTime = 0;
  }

  private _setState(state: DetectionSocketState): void {
    this._state = state;
  }
}
