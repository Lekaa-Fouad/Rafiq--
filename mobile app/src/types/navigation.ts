/**
 * src/types/navigation.ts
 * TypeScript types for indoor navigation API.
 * These are stubs — exact shapes TBD when backend navigation is implemented.
 */

/** Room registration details */
export interface RoomDetails {
  /** Human-readable room name (e.g. "Room 101", "Elevator A") */
  name: string;
  /** Optional floor number */
  floor?: number;
  /** Optional building identifier */
  building?: string;
  /** Optional description */
  description?: string;
  /** ArUco marker IDs associated with this room */
  markerIds?: number[];
}

/** A single step in a navigation route */
export interface NavigationStep {
  instruction: string;
  spoken_instruction: string;
  next_marker_id: number;
  distance_meters: number;
}

/** Full navigation directions response */
export interface NavigationDirections {
  from_room: string;
  to_room: string;
  steps: NavigationStep[];
  total_distance_meters: number;
  estimated_time_seconds: number;
}
