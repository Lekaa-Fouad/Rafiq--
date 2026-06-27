/**
 * src/api/navigation.ts
 * API functions for indoor navigation endpoint.
 *
 * Endpoints (verified against backend/routers/navigation.py):
 *   POST /navigate/guide — JSON body → JSON RafiqResponse<NavigationResponse>
 *   POST /navigate/map   — JSON body → JSON (upload map markers)
 *   GET  /navigate/map/:map_id — JSON response
 *
 * STATUS: All backend endpoints are STUBs — returns { status: "not_implemented" }.
 * TODO: Will return real NavigationResponse when backend Member 4 completes implementation.
 */

import { apiClient } from './client';
import type { RafiqResponse, NavigationRequest, NavigationResponse } from '../types/api';

/**
 * Request navigation guidance from current marker to a destination.
 * TODO: Backend stub — connect to /navigate/guide when Member 4 implements it.
 */
export async function getNavigationGuide(
  request: NavigationRequest
): Promise<RafiqResponse<NavigationResponse | { status: string }>> {
  const response = await apiClient.post<RafiqResponse<NavigationResponse | { status: string }>>(
    '/navigate/guide',
    request
  );
  return response.data;
}

/**
 * Upload a map with ArUco marker positions.
 * TODO: Backend stub — connect to /navigate/map when Member 4 implements it.
 */
export async function uploadMap(mapId: string, markers: Array<{
  marker_id: number;
  x: number;
  y: number;
  label: string;
}>): Promise<RafiqResponse<{ status: string }>> {
  const response = await apiClient.post<RafiqResponse<{ status: string }>>('/navigate/map', {
    map_id: mapId,
    markers,
  });
  return response.data;
}
