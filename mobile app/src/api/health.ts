/**
 * src/api/health.ts
 * Health check API — no authentication required.
 */

import { apiClient } from './client';
import type { RafiqResponse, HealthData } from '../types/api';

/**
 * Check if the backend is reachable and Whisper model is loaded.
 */
export async function checkHealth(): Promise<RafiqResponse<HealthData>> {
  // Health endpoint requires no X-API-Key — call without auth override
  const response = await apiClient.get<RafiqResponse<HealthData>>('/health');
  return response.data;
}
