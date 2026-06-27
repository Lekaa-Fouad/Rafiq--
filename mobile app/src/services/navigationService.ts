/**
 * src/services/navigationService.ts
 * Indoor navigation service — STUB implementation.
 *
 * TODO: The exact endpoint paths for indoor navigation are NOT finalized.
 *       These stubs assume /navigate/guide and /navigate/map based on the
 *       current backend router stubs, but the actual indoor-mapping backend
 *       routes need to be confirmed with the team member implementing
 *       the ArUco marker detection + path-finding before wiring this up.
 *
 * TODO: Confirm these backend routes exist and match these signatures:
 *       POST /navigate/guide   → NavigationDirections
 *       POST /navigate/room    → RoomDetails (register)
 *       GET  /navigate/rooms   → RoomDetails[] (list)
 */

import { apiClient } from './apiClient';
import type { RoomDetails, NavigationDirections } from '../types/navigation';

/**
 * Register a room/landmark with the indoor navigation system.
 *
 * TODO: Exact endpoint path TBD — stub placeholder.
 *
 * @param name     Room name (e.g. "Room 101", "Elevator A")
 * @param details  Room metadata (floor, building, description, marker IDs)
 */
export async function registerRoom(
  name: string,
  details: Omit<RoomDetails, 'name'>,
): Promise<RoomDetails> {
  // TODO: Replace with actual endpoint when backend implements it
  const response = await apiClient.post<RoomDetails>('/navigate/room', {
    name,
    ...details,
  });
  return response.data;
}

/**
 * Get step-by-step navigation directions between two rooms.
 *
 * TODO: Exact endpoint path and request/response shapes TBD.
 *       The backend stub at /navigate/guide currently returns
 *       { status: "not_implemented" }.
 *
 * @param fromRoom  Starting room name or marker ID
 * @param toRoom    Destination room name or label
 */
export async function getDirections(
  fromRoom: string,
  toRoom: string,
): Promise<NavigationDirections> {
  // TODO: Replace with actual endpoint when backend implements it
  // Current backend stub: POST /navigate/guide with
  // { map_id, current_marker_id, destination_label }
  const response = await apiClient.post<NavigationDirections>('/navigate/guide', {
    map_id: 'default',
    current_marker_id: fromRoom,
    destination_label: toRoom,
  });
  return response.data;
}
