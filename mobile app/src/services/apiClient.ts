/**
 * src/services/apiClient.ts
 * Enhanced axios instance with:
 *   - Base URL + API key from environment config
 *   - Request interceptor: attaches X-API-Key header
 *   - Response interceptor: unwraps { success, data, error, message } envelope
 *     → on success: resolves with `data`
 *     → on failure: rejects with typed RafiqApiError
 *   - 10s timeout for REST calls
 */

import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  type AxiosError,
} from 'axios';

// ── Config ────────────────────────────────────────────────────────────────────

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? '123';

export { API_URL, API_KEY };

// ── RafiqApiError ─────────────────────────────────────────────────────────────

/**
 * Typed error thrown when the backend returns `{ success: false }` or
 * when a network/timeout error occurs. Calling code can catch this
 * specifically: `catch (e) { if (e instanceof RafiqApiError) { ... } }`
 */
export class RafiqApiError extends Error {
  /** HTTP status code (0 for network errors) */
  public readonly statusCode: number;
  /** Machine-readable error code */
  public readonly code: string;
  /** Human-friendly message suitable for TTS to the user */
  public readonly spokenMessage: string;

  constructor(opts: {
    message: string;
    statusCode: number;
    code: string;
    spokenMessage?: string;
  }) {
    super(opts.message);
    this.name = 'RafiqApiError';
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.spokenMessage = opts.spokenMessage ?? opts.message;

    // Preserve prototype chain for instanceof checks
    Object.setPrototypeOf(this, RafiqApiError.prototype);
  }
}

// ── Backend envelope shape ────────────────────────────────────────────────────

interface RafiqEnvelope<T = unknown> {
  success: boolean;
  data: T | null;
  error?: string | null;
  message?: string | null;
  spoken_message?: string | null;
}

// ── Axios instance ────────────────────────────────────────────────────────────

const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
});

// ── Request interceptor: attach API key ───────────────────────────────────────

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.headers.set('X-API-Key', API_KEY);

    if (__DEV__) {
      console.log(`[API] → ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    }
    return config;
  },
);

// ── Response interceptor: unwrap envelope ─────────────────────────────────────

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    if (__DEV__) {
      console.log(`[API] ← ${response.status} ${response.config.url}`);
    }

    // Binary responses (TTS audio, OCR-to-voice) have no JSON envelope
    const contentType = String(response.headers['content-type'] ?? '');
    if (
      contentType.includes('audio/') ||
      contentType.includes('application/octet-stream') ||
      response.config.responseType === 'arraybuffer' ||
      response.config.responseType === 'blob'
    ) {
      return response;
    }

    // JSON envelope unwrap
    const body = response.data as RafiqEnvelope;
    if (body && typeof body === 'object' && 'success' in body) {
      if (body.success) {
        // Unwrap: resolve with just the `data` payload
        response.data = body.data;
        return response;
      }

      // Backend returned success=false — throw typed error
      throw new RafiqApiError({
        message: body.error ?? body.message ?? 'Request failed',
        statusCode: response.status,
        code: `API_ERROR_${response.status}`,
        spokenMessage: body.spoken_message ?? body.message ?? 'Something went wrong.',
      });
    }

    // Not an envelope (e.g. health endpoint or raw JSON) — pass through
    return response;
  },

  (error: AxiosError) => {
    if (__DEV__) {
      console.error(
        `[API] ✗ ${error.response?.status ?? 'NETWORK'} ${error.config?.url}`,
        error.message,
      );
    }

    // Try to extract structured error from response body
    const responseData = error.response?.data as RafiqEnvelope | undefined;

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      throw new RafiqApiError({
        message: 'Request timed out. The server may be busy processing.',
        statusCode: 0,
        code: 'TIMEOUT',
        spokenMessage: 'The request timed out. Please try again.',
      });
    }

    if (!error.response) {
      throw new RafiqApiError({
        message: `Network error: ${error.message}`,
        statusCode: 0,
        code: 'NETWORK_ERROR',
        spokenMessage: 'Could not reach the server. Please check your connection.',
      });
    }

    throw new RafiqApiError({
      message: responseData?.error ?? responseData?.message ?? error.message,
      statusCode: error.response.status,
      code: `HTTP_${error.response.status}`,
      spokenMessage:
        responseData?.spoken_message ??
        responseData?.message ??
        `Server error: ${error.response.status}`,
    });
  },
);

export { apiClient };
