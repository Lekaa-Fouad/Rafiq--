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
import re
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

_NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
    "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17",
    "eighteen": "18", "nineteen": "19", "twenty": "20",
}

# Arabic number words → digits
_AR_NUMBER_WORDS = {
    "صفر": "0", "واحد": "1", "اثنين": "2", "اثنان": "2", "ثلاثة": "3",
    "ثلاث": "3", "أربعة": "4", "اربعة": "4", "خمسة": "5", "ستة": "6",
    "سبعة": "7", "ثمانية": "8", "تسعة": "9", "عشرة": "10",
    "أحد عشر": "11", "اثنا عشر": "12", "ثلاثة عشر": "13",
    "أربعة عشر": "14", "خمسة عشر": "15",
}

# Arabic location keywords → English equivalents used in matching
_AR_LOCATION_KEYWORDS = {
    "غرفة": "room", "قاعة": "hall", "مكتب": "office",
    "مدخل": "entrance", "مخرج": "exit", "باب": "exit",
    "دورة المياه": "toilet", "حمام": "toilet",
    "سلم": "stairs", "درج": "stairs", "مصعد": "elevator",
}

# Arabic navigation phrases to strip
_AR_NAV_PHRASES = [
    "أنا في", "انا في", "أنا عند", "انا عند",
    "أريد الذهاب إلى", "اريد الذهاب الى", "أريد الذهاب الى",
    "أريد أن أذهب إلى", "اريد ان اذهب الى",
    "أريد الوصول إلى", "اريد الوصول الى",
    "وأريد الذهاب إلى", "واريد الذهاب الى",
    "وأريد", "واريد", "إلى", "الى", "في", "عند",
]


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

    if request.query_text:
        from_loc, to_loc = _resolve_route_from_text(request.query_text, plan.locations)
    else:
        from_loc = loc_map.get(request.from_location_id or "")
        to_loc   = loc_map.get(request.to_location_id or "")

    if not request.query_text and not request.from_location_id and not request.to_location_id:
        raise RafiqException(
            message="Missing route input.",
            spoken_message="Tell me where you are and where you want to go.",
            status_code=422,
        )

    if not request.query_text and (not request.from_location_id or not request.to_location_id):
        raise RafiqException(
            message="Both from_location_id and to_location_id are required.",
            spoken_message="Tell me both the starting room and the destination room.",
            status_code=422,
        )

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


def _resolve_route_from_text(query_text: str, locations: List[IndoorLocation]) -> tuple[IndoorLocation, IndoorLocation]:
    """
    Parse a natural-language route request in English or Arabic and return
    (from_location, to_location).

    Strategy (tried in order):
    1. Direct name/ID scan — find ≥2 location names in the text by position.
    2. Regex split — split on navigation phrases, match each half.
    3. Fuzzy partial match — score every location against every word-token.
    4. Number-only fallback — "room 1 … room 3" even if names differ.
    """
    # Translate Arabic to normalised English tokens first
    translated = _translate_arabic(query_text)
    norm_query  = _normalize_route_text(translated)

    logger.debug("[INDOOR NLP] raw=%r  translated=%r  norm=%r",
                 query_text, translated, norm_query)

    # ── Strategy 1: scan all location names in text order ─────────────────────
    candidates = _extract_location_candidates(norm_query, locations)
    if len(candidates) >= 2:
        logger.debug("[INDOOR NLP] Strategy 1 matched: %s → %s",
                     candidates[0].name, candidates[1].name)
        return candidates[0], candidates[1]

    # ── Strategy 2: regex split on navigation verbs ───────────────────────────
    # Each tuple: (pattern, reversed) — reversed=True means groups are (to, from)
    split_patterns = [
        # Standard: "I am in <FROM> … go to <TO>"
        (r"(?:i am|i'm|im)\s+(?:in|at|inside|near|by)\s+(?P<from>.+?)\s+"
         r"(?:and\s+)?(?:i want to go(?: to)?|want to go(?: to)?|i need to go(?: to)?"
         r"|need to go(?: to)?|going to|go to|head to|navigate to|take me to)\s+(?P<to>.+)$",
         False),
        # Reversed: "go to <TO> … I am in <FROM>"
        (r"(?:i need to go(?: to)?|i want to go(?: to)?|go to|navigate to|take me to)\s+(?P<to>\S+(?:\s+\S+){0,3}?)"
         r"\s+(?:i am|i'm|im)\s+(?:in|at|inside|near|by)\s+(?P<from>.+)$",
         True),
        # Simple: "from X to Y"
        (r"^from\s+(?P<from>.+?)\s+to\s+(?P<to>.+)$", False),
        # Simple: "X to Y"
        (r"^(?P<from>.+?)\s+to\s+(?P<to>.+)$", False),
    ]
    for pattern, is_reversed in split_patterns:
        m = re.search(pattern, norm_query, flags=re.IGNORECASE)
        if not m:
            continue
        from_raw = m.group("from").strip()
        to_raw   = m.group("to").strip()
        logger.debug("[INDOOR NLP] Strategy 2 split: from=%r  to=%r", from_raw, to_raw)
        from_loc = _fuzzy_match(from_raw, locations)
        to_loc   = _fuzzy_match(to_raw,   locations)
        if from_loc and to_loc and from_loc.id != to_loc.id:
            logger.debug("[INDOOR NLP] Strategy 2 matched: %s → %s",
                         from_loc.name, to_loc.name)
            return from_loc, to_loc

    # ── Strategy 3: score all locations against all tokens ────────────────────
    # Only use if the top two scores are DIFFERENT (one clearly wins)
    scored = _score_all_locations(norm_query, locations)
    if len(scored) >= 2 and scored[0][0] > scored[1][0] and scored[0][1].id != scored[1][1].id:
        from_loc, to_loc = _order_from_to(norm_query, scored[0][1], scored[1][1])
        logger.debug("[INDOOR NLP] Strategy 3 matched: %s → %s",
                     from_loc.name, to_loc.name)
        return from_loc, to_loc

    # ── Strategy 4: extract bare numbers, match against room numbers ──────────
    # Try all numbers including single digits — _match_by_number handles ambiguity
    numbers = re.findall(r'\b(\d+)\b', norm_query)
    if len(numbers) >= 2:
        loc_a = _match_by_number(numbers[0], locations)
        loc_b = _match_by_number(numbers[1], locations)
        if loc_a and loc_b and loc_a.id != loc_b.id:
            from_loc, to_loc = _order_from_to(norm_query, loc_a, loc_b)
            logger.debug("[INDOOR NLP] Strategy 4 (numbers) matched: %s → %s",
                         from_loc.name, to_loc.name)
            return from_loc, to_loc

    # ── Strategy 5: "room X" pattern — match by ordinal position ─────────────
    # e.g. "room 1" → first room, "room 2" → second room (when names don't contain those numbers)
    room_refs = re.findall(r'room\s+(\d+)', norm_query)
    if len(room_refs) >= 2:
        room_locs = [l for l in locations if l.category == "room"]
        loc_a = _match_by_number(room_refs[0], room_locs) or _match_by_ordinal(int(room_refs[0]), room_locs)
        loc_b = _match_by_number(room_refs[1], room_locs) or _match_by_ordinal(int(room_refs[1]), room_locs)
        if loc_a and loc_b and loc_a.id != loc_b.id:
            from_loc, to_loc = _order_from_to(norm_query, loc_a, loc_b)
            logger.debug("[INDOOR NLP] Strategy 5 (room refs) matched: %s → %s",
                         from_loc.name, to_loc.name)
            return from_loc, to_loc

    logger.warning("[INDOOR NLP] All strategies failed for: %r (norm: %r)", query_text, norm_query)
    raise RafiqException(
        message=f"Could not understand route request: '{query_text}'. "
                f"Available locations: {[l.name for l in locations]}",
        spoken_message="I could not understand. Please say something like: "
                       "I am in room one and I want to go to room three.",
        status_code=422,
    )


# ── Arabic translation helper ─────────────────────────────────────────────────

def _translate_arabic(text: str) -> str:
    """
    Translate Arabic number words and location keywords to English tokens
    so the rest of the NLP pipeline (which works on English) can process them.
    """
    result = text

    # Replace multi-word Arabic number phrases first (e.g. "أحد عشر" = 11)
    for ar, en in sorted(_AR_NUMBER_WORDS.items(), key=lambda x: -len(x[0])):
        result = result.replace(ar, en)

    # Replace Arabic location keywords
    for ar, en in sorted(_AR_LOCATION_KEYWORDS.items(), key=lambda x: -len(x[0])):
        result = result.replace(ar, en)

    # Strip Arabic navigation phrases
    for phrase in sorted(_AR_NAV_PHRASES, key=lambda x: -len(x)):
        result = result.replace(phrase, " ")

    return result.strip()


# ── Fuzzy matching helpers ────────────────────────────────────────────────────

def _fuzzy_match(fragment: str, locations: List[IndoorLocation]) -> Optional[IndoorLocation]:
    """
    Match a text fragment to the best location using multiple strategies:
    1. Exact alias match
    2. Alias substring containment
    3. Number match (single or multi digit in fragment vs location name)
    4. Token overlap score (lowest priority — breaks ties only)
    """
    norm = _normalize_route_text(fragment)
    if not norm:
        return None

    # ── Priority 1: exact alias ───────────────────────────────────────────────
    for loc in locations:
        if norm in _location_aliases(loc):
            return loc

    # ── Priority 2: alias substring containment ───────────────────────────────
    best_contain_loc   = None
    best_contain_score = -1
    for loc in locations:
        for alias in _location_aliases(loc):
            if alias in norm or norm in alias:
                score = len(alias)
                if score > best_contain_score:
                    best_contain_score = score
                    best_contain_loc   = loc

    # ── Priority 3: number match ──────────────────────────────────────────────
    # Extract all numbers (any length) from fragment and try to match rooms
    num_loc = None
    best_num_score = -1
    for num in re.findall(r'\b(\d+)\b', norm):
        candidate = _match_by_number(num, locations)
        if candidate:
            score = len(num)
            if score > best_num_score:
                best_num_score = score
                num_loc = candidate

    # Number match wins over substring containment when the number is specific
    if num_loc and best_num_score >= 1:
        # But don't override if substring match is clearly stronger (longer alias)
        if best_contain_score < best_num_score + 4:
            return num_loc

    if best_contain_loc:
        return best_contain_loc

    # ── Priority 4: token overlap (last resort) ───────────────────────────────
    frag_tokens = set(norm.split()) - {"room", "the", "a", "an", "to", "in", "at"}
    best_overlap_loc   = None
    best_overlap_score = -1
    for loc in locations:
        for alias in _location_aliases(loc):
            overlap = frag_tokens & set(alias.split())
            if overlap:
                score = sum(len(w) for w in overlap)
                if score > best_overlap_score:
                    best_overlap_score = score
                    best_overlap_loc   = loc

    return best_overlap_loc


def _score_all_locations(
    norm_query: str,
    locations: List[IndoorLocation],
) -> List[tuple[int, IndoorLocation]]:
    """Score every location against the full query, return sorted descending."""
    scores: List[tuple[int, IndoorLocation]] = []
    tokens = set(norm_query.split())

    for loc in locations:
        best = 0
        for alias in _location_aliases(loc):
            # Direct substring hit
            if alias in norm_query:
                best = max(best, len(alias) + 20)
                continue
            # Token overlap
            overlap = tokens & set(alias.split())
            if overlap:
                best = max(best, len(" ".join(overlap)) + 5)

        # Digit match bonus (2+ digits only to avoid false single-digit matches)
        numbers = re.findall(r'\b(\d{2,})\b', norm_query)
        for num in numbers:
            if re.search(r'\b' + re.escape(num) + r'\b', _normalize_route_text(loc.name)):
                best = max(best, len(num) + 15)

        if best > 0:
            scores.append((best, loc))

    scores.sort(key=lambda x: -x[0])
    return scores


def _find_first_in_text(norm_query: str, loc: IndoorLocation) -> int:
    """Return the earliest character position where any alias of loc appears."""
    earliest = len(norm_query)
    for alias in _location_aliases(loc):
        idx = norm_query.find(alias)
        if 0 <= idx < earliest:
            earliest = idx
    # Also check bare room numbers extracted from name (including single-digit suffix)
    clean_name = _normalize_route_text(re.sub(r'\s*\(.*?\)', '', loc.name))
    for num in re.findall(r'\b(\d+)\b', clean_name):
        # Try single digit suffix match positions
        for m in re.finditer(r'\b' + re.escape(num[-1]) + r'\b', norm_query):
            if m.start() < earliest:
                earliest = m.start()
        for m in re.finditer(r'\b' + re.escape(num) + r'\b', norm_query):
            if m.start() < earliest:
                earliest = m.start()
    return earliest


def _match_by_number(num: str, locations: List[IndoorLocation]) -> Optional[IndoorLocation]:
    """
    Find a location whose *name* contains the given number as a whole word.
    Only searches names (not IDs) to avoid matching sequence numbers like exit-1.
    """
    # Exact whole-word match in name only
    exact = []
    for loc in locations:
        norm_name = _normalize_route_text(re.sub(r'\s*\(.*?\)', '', loc.name))
        if re.search(r'\b' + re.escape(num) + r'\b', norm_name):
            exact.append(loc)
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        return exact[0]  # caller handles ordering

    # For single digits: match rooms whose name number ends with this digit,
    # but ONLY among rooms (category == "room") to avoid exit-1, toilet-1 etc.
    if len(num) == 1:
        suffix_matches = []
        for loc in locations:
            if loc.category != "room":
                continue
            norm_name = _normalize_route_text(re.sub(r'\s*\(.*?\)', '', loc.name))
            nums_in_name = re.findall(r'\b(\d+)\b', norm_name)
            for n in nums_in_name:
                if n.endswith(num):
                    suffix_matches.append(loc)
                    break
        if len(suffix_matches) == 1:
            return suffix_matches[0]
        # Multiple or zero — too ambiguous
        return None

    return None


def _match_by_ordinal(n: int, room_locs: List[IndoorLocation]) -> Optional[IndoorLocation]:
    """Return the n-th room (1-indexed) from the list, or None if out of range."""
    if 1 <= n <= len(room_locs):
        return room_locs[n - 1]
    return None


def _order_from_to(
    norm_query: str,
    loc_a: IndoorLocation,
    loc_b: IndoorLocation,
) -> tuple[IndoorLocation, IndoorLocation]:
    """
    Given two matched locations, decide which is FROM and which is TO
    by looking for navigation cues in the normalised query text.

    Rules (checked in order):
    1. "i am in/at X" or "i'm in X" or "in X" → X is FROM
    2. "go to / want to go to / need to go to Y" → Y is TO
    3. "from X to Y" → positional order in text
    4. Fallback: whichever appears first in text is FROM
    """
    # Patterns that introduce the FROM location
    from_cues = re.compile(
        r'\b(?:i am|i\'m|im|i\'m)\s+(?:in|at|inside|near|by)\s+(.+?)(?:\s+(?:and|i want|i need|go|$))',
        re.IGNORECASE,
    )
    # Patterns that introduce the TO location
    to_cues = re.compile(
        r'\b(?:go to|going to|want to go to|want to go|need to go to|need to go|'
        r'take me to|navigate to|head to|i want to go to|i want to go|'
        r'i need to go to|i need to go)\s+(.+?)(?:\s+(?:and|i am|i\'m|$)|$)',
        re.IGNORECASE,
    )

    def name_in_fragment(loc: IndoorLocation, fragment: str) -> bool:
        frag_norm = _normalize_route_text(fragment)
        return any(alias in frag_norm or frag_norm in alias
                   for alias in _location_aliases(loc))

    # Try FROM cue
    fm = from_cues.search(norm_query)
    if fm:
        fragment = fm.group(1)
        if name_in_fragment(loc_a, fragment):
            return loc_a, loc_b
        if name_in_fragment(loc_b, fragment):
            return loc_b, loc_a

    # Try TO cue
    tm = to_cues.search(norm_query)
    if tm:
        fragment = tm.group(1)
        if name_in_fragment(loc_a, fragment):
            return loc_b, loc_a
        if name_in_fragment(loc_b, fragment):
            return loc_a, loc_b

    # Fallback: text position order
    pos_a = _find_first_in_text(norm_query, loc_a)
    pos_b = _find_first_in_text(norm_query, loc_b)
    if pos_a <= pos_b:
        return loc_a, loc_b
    return loc_b, loc_a


def _extract_location_candidates(query_text: str, locations: List[IndoorLocation]) -> List[IndoorLocation]:
    normalized_text = _normalize_route_text(query_text)
    matches: List[tuple[int, int, IndoorLocation]] = []

    for location in locations:
        aliases = _location_aliases(location)
        best_index = None
        best_length = 0
        for alias in aliases:
            index = normalized_text.find(alias)
            if index < 0:
                continue
            if best_index is None or index < best_index or (index == best_index and len(alias) > best_length):
                best_index = index
                best_length = len(alias)
        if best_index is not None:
            matches.append((best_index, -best_length, location))

    matches.sort(key=lambda item: (item[0], item[1]))

    ordered: List[IndoorLocation] = []
    seen_ids = set()
    for _, _, location in matches:
        if location.id in seen_ids:
            continue
        ordered.append(location)
        seen_ids.add(location.id)
    return ordered


def _match_location_text(value: str, locations: List[IndoorLocation]) -> Optional[IndoorLocation]:
    normalized_value = _normalize_route_text(value)
    best_location = None
    best_score = -1

    for location in locations:
        for alias in _location_aliases(location):
            if alias == normalized_value:
                return location
            if alias in normalized_value or normalized_value in alias:
                score = len(alias)
                if score > best_score:
                    best_location = location
                    best_score = score

    return best_location


def _location_aliases(location: IndoorLocation) -> List[str]:
    """All normalised text forms of a location's name and id."""
    # Strip area annotation like "(8.5 m²)" from display names
    clean_name = re.sub(r'\s*\(.*?\)', '', location.name).strip()

    raw_names = {clean_name, clean_name.replace("-", " ")}
    raw_ids   = {location.id, location.id.replace("-", " ")}

    name_aliases = [_normalize_route_text(a) for a in raw_names if a]
    id_aliases   = [_normalize_route_text(a) for a in raw_ids   if a]

    aliases = list(dict.fromkeys(name_aliases + id_aliases))

    # Extract room-number portion from the *name only* (not ID),
    # and only for multi-digit numbers (2+ digits) to avoid false matches
    # on sequence numbers like the "1" in "exit-1" or "toilet-1".
    for alias in name_aliases:
        for num in re.findall(r'\b(\d{2,})\b', alias):
            aliases.append(num)

    # Add category keyword alone ONLY for non-room categories
    # Skip "room" because it appears in every phrase
    if location.category and location.category not in ("room", "other"):
        aliases.append(location.category.lower())

    return list(dict.fromkeys(a for a in aliases if a))


def _normalize_route_text(value: str) -> str:
    """Lowercase, remove punctuation, convert number-words to digits."""
    text = value.lower().replace("-", " ").replace("_", " ")
    # Strip area annotations like "(8.5 m²)" so they don't confuse matching
    text = re.sub(r'\(\s*[\d.]+\s*m[²2]?\s*\)', ' ', text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)

    def replace_number_word(match: re.Match) -> str:
        return _NUMBER_WORDS.get(match.group(0), match.group(0))

    text = re.sub(
        r"\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|"
        r"eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|"
        r"eighteen|nineteen|twenty)\b",
        replace_number_word,
        text,
    )
    text = re.sub(r"\s+", " ", text).strip()
    return text


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
