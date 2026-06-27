/**
 * src/api/client.ts
 * Axios instance pre-configured with:
 * - Base URL from EXPO_PUBLIC_API_URL env variable
 * - X-API-Key header from EXPO_PUBLIC_API_KEY env variable
 * - 30-second timeout (generous for heavy AI models like Whisper/DeepFace)
 */

import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? '123';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 60_000,   // 60s — Whisper/DeepFace can be slow on first cold run
  headers: {
    'X-API-Key': API_KEY,
  },
});

// Request logging (dev only)
if (__DEV__) {
  apiClient.interceptors.request.use((config) => {
    console.log(`[API] → ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
  });

  apiClient.interceptors.response.use(
    (response) => {
      console.log(`[API] ← ${response.status} ${response.config.url}`);
      return response;
    },
    (error) => {
      console.error(`[API] ✗ ${error.response?.status ?? 'NETWORK'} ${error.config?.url}`, error.message);
      return Promise.reject(error);
    }
  );
}

export { API_URL, API_KEY };
