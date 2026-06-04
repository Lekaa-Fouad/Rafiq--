"""
services/indoor_service.py — Indoor mapping business logic.

Path algorithm
--------------
Every room MUST have:
  - A bounding box / perimeter (x1,y1,x2,y2)          [REQUIRED]
  - A door_side (top / bottom / left / right)          [REQUIRED]
  - A door_position (left / center / right)            [default: center]

The door pixel is auto-calculated from bounds + door_side + door_position.
An explicit `door` PixelPoint overrides the calculation.

The path from Room A to Room B is:
  1. Start at Room A's point (anywhere inside the room)
  2. Walk to Room A's calculated door (exits through the wall)
  3. Walk to corridor centre (corridor_y)
  4. Walk horizontally along corridor to Room B's door x
  5. Walk to Room B's calculated door (enters through the wall)
  6. Walk to Room B's point

This ensures the line always exits/enters through the door — never through a wall.
"""

import json
import logging
import math
import time
import uuid
from typing import List, Optional

import aiosqlite

from core.exceptions import RafiqException
from models.indoor import (
    FloorPlan,
    IndoorLocation,
    IndoorRouteRequest,
    IndoorRouteResponse,
    IndoorRouteStep,
    PixelPoint,
    RoomBounds,
    SaveFloorPlanRequest,
)

logger = logging.getLogger(__name__)

PIXELS_PER_METRE = 20.0  # 1 metre = 20 pixels (adjust per floor plan scale)


# ── DB setup ──────────────────────────────────────────────────────────────────

async def create_tables(conn: aiosqlite.Connection) -> None:
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS indoor_floor_plans (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            image_url   TEXT NOT NULL DEFAULT '',
            width       INTEGER NOT NULL DEFAULT 800,
            height      INTEGER NOT NULL DEFAULT 600,
            corridor_y  INTEGER NOT NULL DEFAULT 300,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Add corridor_y column if it doesn't exist (migration for existing DBs)
    try:
        await conn.execute("ALTER TABLE indoor_floor_plans ADD COLUMN corridor_y INTEGER NOT NULL DEFAULT 300")
    except Exception:
        pass  # column already exists

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS indoor_locations (
            id              TEXT NOT NULL,
            floor_plan_id   TEXT NOT NULL REFERENCES indoor_floor_plans(id) ON DELETE CASCADE,
            name            TEXT NOT NULL,
            x               INTEGER NOT NULL,
            y               INTEGER NOT NULL,
            door_x          INTEGER,
            door_y          INTEGER,
            door_side       TEXT,
            door_position   TEXT NOT NULL DEFAULT 'center',
            bounds_x1       INTEGER,
            bounds_y1       INTEGER,
            bounds_x2       INTEGER,
            bounds_y2       INTEGER,
            category        TEXT NOT NULL DEFAULT 'room',
            area_m2         REAL,
            PRIMARY KEY (id, floor_plan_id)
        )
    """)
    # Add door_position column if it doesn't exist (migration for existing DBs)
    try:
        await conn.execute(
            "ALTER TABLE indoor_locations ADD COLUMN door_position TEXT NOT NULL DEFAULT 'center'"
        )
    except Exception:
        pass  # column already exists
    await conn.commit()
    logger.info("[INDOOR] Tables verified/created.")


# ── Public functions ──────────────────────────────────────────────────────────

async def save_floor_plan(
    request: SaveFloorPlanRequest,
    image_url: str,
    width: int,
    height: int,
    conn: aiosqlite.Connection,
) -> FloorPlan:
    plan_id = str(uuid.uuid4())[:8]

    try:
        await conn.execute(
            "INSERT INTO indoor_floor_plans (id, name, image_url, width, height, corridor_y) VALUES (?,?,?,?,?,?)",
            (plan_id, request.name, image_url, width, height, request.corridor_y),
        )
        for loc in request.locations:
            # explicit door pixel override (optional)
            door_x = loc.door.x if loc.door else None
            door_y = loc.door.y if loc.door else None
            # bounds is now required on the model
            await conn.execute(
                """INSERT INTO indoor_locations
                   (id, floor_plan_id, name, x, y,
                    door_x, door_y, door_side, door_position,
                    bounds_x1, bounds_y1, bounds_x2, bounds_y2,
                    category, area_m2)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (loc.id, plan_id, loc.name, loc.point.x, loc.point.y,
                 door_x, door_y, loc.door_side, loc.door_position,
                 loc.bounds.x1, loc.bounds.y1, loc.bounds.x2, loc.bounds.y2,
                 loc.category, loc.area_m2),
            )
        await conn.commit()
    except aiosqlite.Error as exc:
        raise RafiqException(
            message=f"Failed to save floor plan: {exc}",
            spoken_message="Could not save the floor plan.",
            status_code=500,
        ) from exc

    logger.info("[INDOOR] Saved — id: %s, name: %s, locations: %d",
                plan_id, request.name, len(request.locations))

    return FloorPlan(
        id=plan_id, name=request.name, image_url=image_url,
        width=width, height=height, corridor_y=request.corridor_y,
        locations=request.locations,
    )


async def get_floor_plan(plan_id: str, conn: aiosqlite.Connection) -> FloorPlan:
    async with conn.execute(
        "SELECT id, name, image_url, width, height, corridor_y FROM indoor_floor_plans WHERE id = ?",
        (plan_id,),
    ) as cur:
        row = await cur.fetchone()

    if not row:
        raise RafiqException(
            message=f"Floor plan '{plan_id}' not found.",
            spoken_message="Floor plan not found.",
            status_code=404,
        )

    locations = await _load_locations(plan_id, conn)
    return FloorPlan(
        id=row[0], name=row[1], image_url=row[2],
        width=row[3], height=row[4],
        corridor_y=row[5] if row[5] is not None else 300,
        locations=locations,
    )


async def list_floor_plans(conn: aiosqlite.Connection) -> List[FloorPlan]:
    async with conn.execute(
        "SELECT id, name, image_url, width, height, corridor_y FROM indoor_floor_plans ORDER BY created_at DESC"
    ) as cur:
        rows = await cur.fetchall()

    plans = []
    for row in rows:
        locations = await _load_locations(row[0], conn)
        plans.append(FloorPlan(
            id=row[0], name=row[1], image_url=row[2],
            width=row[3], height=row[4],
            corridor_y=row[5] if row[5] is not None else 300,
            locations=locations,
        ))
    return plans


async def delete_floor_plan(plan_id: str, conn: aiosqlite.Connection) -> bool:
    async with conn.execute(
        "DELETE FROM indoor_floor_plans WHERE id = ?", (plan_id,)
    ) as cur:
        await conn.commit()
        return cur.rowcount > 0


async def get_indoor_route(
    request: IndoorRouteRequest,
    conn: aiosqlite.Connection,
) -> IndoorRouteResponse:
    start_time = time.perf_counter()

    plan     = await get_floor_plan(request.floor_plan_id, conn)
    loc_map  = {loc.id: loc for loc in plan.locations}
    from_loc = loc_map.get(request.from_location_id)
    to_loc   = loc_map.get(request.to_location_id)

    if not from_loc:
        raise RafiqException(message=f"Location '{request.from_location_id}' not found.",
                             spoken_message="Starting location not found.", status_code=404)
    if not to_loc:
        raise RafiqException(message=f"Location '{request.to_location_id}' not found.",
                             spoken_message="Destination not found.", status_code=404)

    path  = _build_door_path(from_loc, to_loc, plan.corridor_y)
    dist  = round(_path_length(path) / PIXELS_PER_METRE, 1)
    steps = _build_steps(from_loc, to_loc, path)
    speech = f"Indoor route from {from_loc.name} to {to_loc.name}: {_fmt(dist)}."

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
    logger.info("[INDOOR] Route %s → %s, %.1f m, %d waypoints",
                from_loc.name, to_loc.name, dist, len(path))

    return IndoorRouteResponse(
        floor_plan_id=plan.id, floor_plan_name=plan.name,
        from_location=from_loc, to_location=to_loc,
        path=path, steps=steps,
        total_distance_meters=dist, speech=speech,
        processing_time_ms=elapsed_ms,
    )


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _load_locations(plan_id: str, conn: aiosqlite.Connection) -> List[IndoorLocation]:
    async with conn.execute(
        """SELECT id, name, x, y,
                  door_x, door_y, door_side, door_position,
                  bounds_x1, bounds_y1, bounds_x2, bounds_y2,
                  category, area_m2
           FROM indoor_locations WHERE floor_plan_id = ?""",
        (plan_id,),
    ) as cur:
        rows = await cur.fetchall()

    # Column index map:
    # r[0]=id  r[1]=name  r[2]=x  r[3]=y
    # r[4]=door_x  r[5]=door_y  r[6]=door_side  r[7]=door_position
    # r[8]=bounds_x1  r[9]=bounds_y1  r[10]=bounds_x2  r[11]=bounds_y2
    # r[12]=category  r[13]=area_m2
    result = []
    for r in rows:
        door = PixelPoint(x=r[4], y=r[5]) if r[4] is not None else None

        # bounds is now required; for legacy rows missing bounds, create a
        # default box around the centre point so the model stays valid
        if r[8] is not None:
            bounds = RoomBounds(x1=r[8], y1=r[9], x2=r[10], y2=r[11])
        else:
            px, py = r[2], r[3]
            bounds = RoomBounds(x1=px - 50, y1=py - 50, x2=px + 50, y2=py + 50)

        door_side     = r[6] if r[6] else "bottom"   # legacy fallback
        door_position = r[7] if r[7] else "center"   # legacy fallback

        result.append(IndoorLocation(
            id=r[0], name=r[1], point=PixelPoint(x=r[2], y=r[3]),
            door=door,
            door_side=door_side,
            door_position=door_position,
            bounds=bounds,
            category=r[12],
            area_m2=r[13],
        ))
    return result


def _build_door_path(
    from_loc: IndoorLocation,
    to_loc: IndoorLocation,
    corridor_y: int,
) -> List[PixelPoint]:
    """
    Build a path that goes through doors and the corridor centre.

    Path:
      1. Start center
      2. Start door (exit the room)
      3. Corridor centre directly above/below the start door
      4. Walk horizontally along corridor to above/below the end door
      5. End door (enter the destination room)
      6. End center

    If a room has no door defined, we use a door derived from its
    bounding box (centre of the corridor-facing wall).
    """
    start  = from_loc.point
    end    = to_loc.point
    s_door = _get_door(from_loc, corridor_y)
    e_door = _get_door(to_loc,   corridor_y)

    path: List[PixelPoint] = []

    # 1. Start center
    path.append(PixelPoint(x=start.x, y=start.y))

    # 2. Walk from start center to start door
    if start.x != s_door.x or start.y != s_door.y:
        path.append(PixelPoint(x=s_door.x, y=s_door.y))

    # 3. Walk from door to corridor centre (same x as door)
    path.append(PixelPoint(x=s_door.x, y=corridor_y))

    # 4. Walk along corridor centre to destination door's x
    if s_door.x != e_door.x:
        path.append(PixelPoint(x=e_door.x, y=corridor_y))

    # 5. Walk from corridor down/up to destination door
    if e_door.y != corridor_y:
        path.append(PixelPoint(x=e_door.x, y=e_door.y))

    # 6. Walk from door to destination center
    if end.x != e_door.x or end.y != e_door.y:
        path.append(PixelPoint(x=end.x, y=end.y))

    # Remove consecutive duplicates
    clean: List[PixelPoint] = [path[0]]
    for pt in path[1:]:
        if pt.x != clean[-1].x or pt.y != clean[-1].y:
            clean.append(pt)
    return clean


def _get_door(loc: IndoorLocation, corridor_y: int) -> PixelPoint:
    """
    Return the door pixel for a location.

    Delegates to loc.computed_door() which:
      1. Returns the explicit `door` pixel override if set.
      2. Otherwise calculates from bounds + door_side + door_position
         (left=25%, center=50%, right=75% along the chosen wall).

    `corridor_y` is kept for API compatibility but is no longer needed
    since door_side is now a required field on every location.
    """
    return loc.computed_door()


def _path_length(path: List[PixelPoint]) -> float:
    total = 0.0
    for i in range(1, len(path)):
        dx = path[i].x - path[i-1].x
        dy = path[i].y - path[i-1].y
        total += math.sqrt(dx*dx + dy*dy)
    return total


def _build_steps(
    from_loc: IndoorLocation,
    to_loc: IndoorLocation,
    path: List[PixelPoint],
) -> List[IndoorRouteStep]:
    steps: List[IndoorRouteStep] = []

    for i in range(1, len(path)):
        p1, p2 = path[i-1], path[i]
        dx = p2.x - p1.x
        dy = p2.y - p1.y
        dist = round(math.sqrt(dx*dx + dy*dy) / PIXELS_PER_METRE, 1)
        if dist <= 0:
            continue
        direction = _direction(p1, p2)

        # Turn instruction if direction changed
        if i > 1:
            prev_dir = _direction(path[i-2], path[i-1])
            if prev_dir != direction:
                turn = _turn(path[i-2], path[i-1], path[i])
                steps.append(IndoorRouteStep(instruction=f"{turn}.", distance_meters=0))

        steps.append(IndoorRouteStep(
            instruction=f"Go {direction} for {_fmt(dist)}.",
            distance_meters=dist,
        ))

    steps.append(IndoorRouteStep(
        instruction=f"You have arrived at {to_loc.name}.",
        distance_meters=0,
    ))
    return steps


def _direction(a: PixelPoint, b: PixelPoint) -> str:
    dx, dy = b.x - a.x, b.y - a.y
    if abs(dx) > abs(dy):
        return "right" if dx > 0 else "left"
    return "straight ahead"


def _turn(a: PixelPoint, b: PixelPoint, c: PixelPoint) -> str:
    ax, ay = b.x - a.x, b.y - a.y
    bx, by = c.x - b.x, c.y - b.y
    cross = ax * by - ay * bx
    return "Turn right" if cross > 0 else "Turn left"


def _fmt(metres: float) -> str:
    if metres < 1:
        return f"{int(metres * 100)} centimetres"
    return f"{metres:.0f} metre{'s' if metres != 1 else ''}"
