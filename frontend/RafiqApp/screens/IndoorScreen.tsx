/**
 * screens/IndoorScreen.tsx
 *
 * Indoor navigation screen.
 *
 * How it works:
 *  1. Load a saved floor plan (image + named locations)
 *  2. Tap a location as START, tap another as END
 *  3. The app draws the path on top of the floor plan image
 *  4. Speaks the directions aloud
 *
 * Works on both web and mobile.
 */

import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Polyline, Text as SvgText, Rect } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import { API_KEY, BACKEND_URL } from "../config";
import localFloorPlans from "../data/floorPlans.json";
import { useVoiceRecorder } from "../controllers/useVoiceRecorder";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PixelPoint { x: number; y: number; }
interface RoomBounds { x1: number; y1: number; x2: number; y2: number; }

interface IndoorLocation {
  id: string;
  name: string;
  point: PixelPoint;
  category: string;
  bounds?: RoomBounds;
  door_side?: "top" | "bottom" | "left" | "right";
  door_position?: "left" | "center" | "right";
  door?: PixelPoint;
  area_m2?: number;
}

const getComputedDoor = (loc: IndoorLocation): PixelPoint | null => {
  if (loc.door) return loc.door;
  if (!loc.bounds || !loc.door_side || !loc.door_position) return null;
  const offset = loc.door_position === "left" ? 0.25 : loc.door_position === "right" ? 0.75 : 0.50;
  const { x1, y1, x2, y2 } = loc.bounds;
  if (loc.door_side === "top") return { x: x1 + (x2 - x1) * offset, y: y1 };
  if (loc.door_side === "bottom") return { x: x1 + (x2 - x1) * offset, y: y2 };
  if (loc.door_side === "left") return { x: x1, y: y1 + (y2 - y1) * offset };
  if (loc.door_side === "right") return { x: x2, y: y1 + (y2 - y1) * offset };
  return null;
};

interface FloorPlan {
  id: string;
  name: string;
  image_url: string;
  width: number;
  height: number;
  locations: IndoorLocation[];
}

interface RouteStep {
  instruction: string;
  distance_meters: number;
}

interface IndoorRoute {
  floor_plan_name: string;
  from_location: IndoorLocation;
  to_location: IndoorLocation;
  path: PixelPoint[];
  steps: RouteStep[];
  total_distance_meters: number;
  speech: string;
}

// ── Category colors ───────────────────────────────────────────────────────────

const categoryColor = (cat: string) => {
  switch (cat) {
    case "exit":     return "#cc0000";
    case "stairs":   return "#FF6600";
    case "elevator": return "#9900cc";
    case "toilet":   return "#0099cc";
    default:         return "#0066FF";
  }
};

const categoryIcon = (cat: string) => {
  switch (cat) {
    case "exit":     return "🚪";
    case "stairs":   return "🪜";
    case "elevator": return "🛗";
    case "toilet":   return "🚻";
    default:         return "📍";
  }
};

const DEMO_FLOOR_PLAN: FloorPlan = {
  id: "demo-floor-1",
  name: "Demo Building – Floor 1",
  image_url: "https://via.placeholder.com/800x600.png?text=Indoor+Demo+Floor",
  width: 800,
  height: 600,
  locations: [
    {
      id: "room-101",
      name: "Room 101 (8.5 m²)",
      point: { x: 130, y: 340 },
      bounds: { x1: 100, y1: 300, x2: 200, y2: 400 },
      category: "room",
      door_side: "bottom",
      door_position: "center",
      area_m2: 8.5,
    },
    {
      id: "room-102",
      name: "Room 102 (9.4 m²)",
      point: { x: 520, y: 150 },
      bounds: { x1: 470, y1: 110, x2: 570, y2: 210 },
      category: "room",
      door_side: "bottom",
      door_position: "center",
      area_m2: 9.4,
    },
    {
      id: "stairs-1",
      name: "Stairs",
      point: { x: 250, y: 520 },
      bounds: { x1: 220, y1: 480, x2: 280, y2: 560 },
      category: "stairs",
      door_side: "top",
      door_position: "center",
    },
    {
      id: "elevator-1",
      name: "Elevator",
      point: { x: 430, y: 500 },
      bounds: { x1: 410, y1: 460, x2: 450, y2: 540 },
      category: "elevator",
      door_side: "top",
      door_position: "center",
    },
    {
      id: "exit-1",
      name: "Exit",
      point: { x: 720, y: 520 },
      bounds: { x1: 680, y1: 480, x2: 760, y2: 560 },
      category: "exit",
      door_side: "top",
      door_position: "center",
    },
  ],
};

const BACKEND_URLS = [
  BACKEND_URL,                    // e.g. http://192.168.100.8:8000
  "http://192.168.100.8:8000",    // explicit LAN IP
  "http://10.0.2.2:8000",         // Android emulator → host loopback
  "http://localhost:8000",
  "http://127.0.0.1:8000",
].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i); // deduplicate

const LOCAL_STORAGE_KEY = "RafiqAppLocalFloorPlans";
const DELETED_PLAN_IDS_KEY = "RafiqAppDeletedFloorPlanIds";

const getStoredFloorPlans = (): FloorPlan[] => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FloorPlan[]) : [];
  } catch {
    return [];
  }
};

const saveStoredFloorPlans = (plans: FloorPlan[]) => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // ignore storage failures
  }
};

const getDeletedPlanIds = (): string[] => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = window.localStorage.getItem(DELETED_PLAN_IDS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

const saveDeletedPlanIds = (ids: string[]) => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(DELETED_PLAN_IDS_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage failures
  }
};

const markPlanAsDeleted = (id: string) => {
  const ids = new Set(getDeletedPlanIds());
  ids.add(id);
  saveDeletedPlanIds(Array.from(ids));
};

const fetchBackend = async (path: string, options: RequestInit = {}) => {
  let lastError: Error | null = null;

  for (let i = 0; i < BACKEND_URLS.length; i += 1) {
    const base = BACKEND_URLS[i].replace(/\/$/, "");
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;

      const retryStatuses = [404, 500, 502, 503, 504];
      if (i === BACKEND_URLS.length - 1 || !retryStatuses.includes(res.status)) {
        return res;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error("Unable to reach backend");
};

// ── try multiple backend URLs, building fresh options each attempt ─────────
// Use this for FormData (multipart) requests — the body stream can only be
// read once, so we need a factory function that creates a new body every try.
const tryUrls = async (
  path: string,
  buildOptions: () => RequestInit,
): Promise<Response> => {
  let lastError: Error | null = null;
  for (const base of BACKEND_URLS) {
    const url = `${base.replace(/\/$/, "")}${path}`;
    try {
      const res = await fetch(url, buildOptions());
      if (res.ok) return res;
      // Don't retry auth / validation errors
      if (res.status === 401 || res.status === 422) return res;
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError || new Error("Unable to reach backend");
};

// ── Main component ────────────────────────────────────────────────────────────

export default function IndoorScreen() {
  const [floorPlans, setFloorPlans]   = useState<FloorPlan[]>([]);
  const [selected, setSelected]       = useState<FloorPlan | null>(null);
  const [fromLoc, setFromLoc]         = useState<IndoorLocation | null>(null);
  const [toLoc, setToLoc]             = useState<IndoorLocation | null>(null);
  const [route, setRoute]             = useState<IndoorRoute | null>(null);
  const [loading, setLoading]         = useState(false);
  const [status, setStatus]           = useState("Select a floor plan to start");
  const [showUpload, setShowUpload]   = useState(false);
  const [selectingFor, setSelectingFor] = useState<"from" | "to" | null>(null);
  const [fromText, setFromText]         = useState("");
  const [toText, setToText]             = useState("");
  const [fromSuggestions, setFromSuggestions] = useState<IndoorLocation[]>([]);
  const [toSuggestions, setToSuggestions]     = useState<IndoorLocation[]>([]);
  const [queryText, setQueryText]       = useState("");
  const [voiceStatus, setVoiceStatus]   = useState("");

  const screenWidth = Dimensions.get("window").width;
  const routeRequestRef = useRef("");
  // Keep a ref to selected so the voice callback always has the latest value
  const selectedRef = useRef<FloorPlan | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // ── Voice recorder hook ────────────────────────────────────────────────────
  const { state: recorderState, isRecording, toggle: toggleMic } = useVoiceRecorder({
    onAudioReady: async (blob, filename) => {
      const currentPlan = selectedRef.current;
      if (!currentPlan) {
        setVoiceStatus("⚠️ Please select a floor plan first.");
        return;
      }
      setVoiceStatus("🔄 Transcribing your voice...");

      try {
        // ── Step 1: STT — audio blob → transcript ──────────────────────────
        // Build FormData fresh each retry attempt via tryUrls
        const sttRes = await tryUrls("/voice/stt", () => {
          const form = new FormData();
          if (Platform.OS === 'web') {
            form.append("audio", blob, filename);
          } else {
            form.append("audio", blob as any);
          }
          return {
            method: "POST",
            headers: { "X-API-Key": API_KEY },
            // NO Content-Type header — browser sets it with boundary automatically
            body: form,
          };
        });

        const sttText = await sttRes.text();
        let sttJson: any;
        try { sttJson = JSON.parse(sttText); } catch { throw new Error(`STT error: ${sttText.slice(0, 120)}`); }

        if (!sttJson.success) throw new Error(sttJson.message || "STT failed");

        const transcript: string = sttJson.data?.transcript ?? "";
        if (!transcript.trim()) {
          setVoiceStatus("⚠️ No speech detected. Speak clearly and try again.");
          return;
        }

        // Show transcript immediately in the text box
        setVoiceStatus(`🎤 Heard: "${transcript}"`);
        setQueryText(transcript);

        // ── Step 2: Route — transcript → from / to ─────────────────────────
        setLoading(true);
        routeRequestRef.current = "";

        const routeRes = await tryUrls("/indoor/route", () => ({
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
          body: JSON.stringify({
            floor_plan_id: currentPlan.id,
            query_text: transcript,
          }),
        }));

        const routeText = await routeRes.text();
        let routeJson: any;
        try { routeJson = JSON.parse(routeText); } catch { throw new Error(`Route error: ${routeText.slice(0, 120)}`); }

        if (!routeRes.ok || !routeJson.success)
          throw new Error(routeJson.message || "Could not find a route for that request");

        const routeData = routeJson.data;

        // Fill FROM / TO labels
        setFromLoc(routeData.from_location);
        setToLoc(routeData.to_location);
        setFromText(routeData.from_location.name);
        setToText(routeData.to_location.name);
        setRoute(routeData);
        setStatus(routeData.speech);
        speak(routeData.speech);
        setVoiceStatus(`✅ ${routeData.from_location.name} → ${routeData.to_location.name}`);
      } catch (err: any) {
        const msg = err?.message || "Unknown error";
        setVoiceStatus(`❌ ${msg}`);
        Alert.alert(
          "Could not process voice",
          `${msg}\n\nTip: say clearly — "I am in room one and I want to go to room three"`,
        );
      } finally {
        setLoading(false);
      }
    },
  });

  // ── Load floor plans ───────────────────────────────────────────────────────
  useEffect(() => {
    loadFloorPlans(true);
  }, []);

  const loadFloorPlans = async (autoSelect = false) => {
    let plans: FloorPlan[] = [];
    const storedPlans = getStoredFloorPlans();
    const deletedIds = new Set(getDeletedPlanIds());
    try {
      const res = await fetchBackend("/indoor/floor-plans", {
        headers: { "X-API-Key": API_KEY },
      });
      const json = await res.json();
      plans = Array.isArray(json)
        ? json
        : json.success && Array.isArray(json.data)
          ? json.data
          : [];
    } catch (err) {
      console.warn("Indoor plan load failed, falling back to local floorPlans.json.", err);
      plans = (localFloorPlans as FloorPlan[]);
    }

    plans = [...plans, ...storedPlans].filter((plan) => !deletedIds.has(plan.id));
    if (plans.length === 0) {
      plans = [DEMO_FLOOR_PLAN];
    }

    setFloorPlans(plans);
    if (autoSelect && plans.length > 0 && !selected) {
      selectFloorPlan(plans[0]);
    }
  };

  // ── Select floor plan ──────────────────────────────────────────────────────
  const selectFloorPlan = (plan: FloorPlan) => {
    routeRequestRef.current = "";
    setSelected(plan);
    setFromLoc(null);
    setToLoc(null);
    setRoute(null);
    setFromText("");
    setToText("");
    setFromSuggestions([]);
    setToSuggestions([]);
    setQueryText("");
    setStatus(`${plan.name} — tap a location or type below`);
    setSelectingFor("from");
  };

  // ── Delete floor plan ─────────────────────────────────────────────────────
  const deleteFloorPlan = () => {
    if (!selected) return;

    const finalizeDelete = (message: string) => {
      setSelected(null);
      setFromLoc(null);
      setToLoc(null);
      setRoute(null);
      setStatus("Select a floor plan to start");
      setSelectingFor(null);
      setFloorPlans((prev) => prev.filter((plan) => plan.id !== selected.id));
      Alert.alert("Deleted", message);
    };

    const deleteStoredPlan = () => {
      const storedPlans = getStoredFloorPlans();
      saveStoredFloorPlans(storedPlans.filter((plan) => plan.id !== selected.id));
      finalizeDelete(`Floor plan "${selected.name}" was deleted locally.`);
    };

    Alert.alert(
      "Delete Floor Plan",
      `Are you sure you want to delete "${selected.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const storedPlans = getStoredFloorPlans();
            const isStaticLocalPlan = (localFloorPlans as FloorPlan[]).some((plan) => plan.id === selected.id);
            const isLocalPlan = selected.id.startsWith("local-") || storedPlans.some((plan) => plan.id === selected.id) || isStaticLocalPlan;
            if (isLocalPlan) {
              if (storedPlans.some((plan) => plan.id === selected.id)) {
                deleteStoredPlan();
              } else {
                markPlanAsDeleted(selected.id);
                finalizeDelete(`Floor plan "${selected.name}" was deleted locally.`);
              }
              return;
            }

            try {
              const res  = await fetchBackend(`/indoor/floor-plan/${selected.id}`, {
                method: "DELETE",
                headers: { "X-API-Key": API_KEY },
              });
              const json = await res.json();
              if (!json.success) throw new Error(json.message || "Delete failed");
              finalizeDelete(`Floor plan "${selected.name}" was deleted from the backend.`);
            } catch (err: any) {
              if (storedPlans.some((plan) => plan.id === selected.id)) {
                deleteStoredPlan();
                return;
              }
              if (isStaticLocalPlan) {
                markPlanAsDeleted(selected.id);
              }
              finalizeDelete(`Floor plan "${selected.name}" was removed locally (backend delete failed).`);
            }
          },
        },
      ]
    );
  };

  // ── Reset location ─────────────────────────────────────────────────────────
  const reset = () => {
    routeRequestRef.current = "";
    setFromLoc(null);
    setToLoc(null);
    setRoute(null);
    setSelectingFor("from");
    setFromText("");
    setToText("");
    setFromSuggestions([]);
    setToSuggestions([]);
    setQueryText("");
    setStatus(`${selected?.name} — tap a location or type below`);
  };

  // ── Tap a location ─────────────────────────────────────────────────────────
  const tapLocation = (loc: IndoorLocation) => {
    if (selectingFor === "from") {
      setFromLoc(loc);
      setFromText(loc.name);
      setFromSuggestions([]);
      setSelectingFor("to");
      setStatus(`Start: ${loc.name} — now tap or type destination`);
    } else if (selectingFor === "to") {
      setToLoc(loc);
      setToText(loc.name);
      setToSuggestions([]);
      setSelectingFor(null);
      setStatus(`From: ${fromLoc?.name} → To: ${loc.name}`);
    }
  };

  // ── Filter suggestions from text input ────────────────────────────────────
  const filterLocations = (text: string): IndoorLocation[] => {
    if (!selected || !text.trim()) return [];
    const q = text.toLowerCase();
    return selected.locations.filter(
      (loc) =>
        loc.name.toLowerCase().includes(q) ||
        loc.id.toLowerCase().includes(q) ||
        loc.category.toLowerCase().includes(q)
    );
  };

  const handleFromTextChange = (text: string) => {
    setFromText(text);
    setFromLoc(null);
    setFromSuggestions(filterLocations(text));
  };

  const handleToTextChange = (text: string) => {
    setToText(text);
    setToLoc(null);
    setToSuggestions(filterLocations(text));
  };

  const pickFromSuggestion = (loc: IndoorLocation) => {
    setFromLoc(loc);
    setFromText(loc.name);
    setFromSuggestions([]);
    setSelectingFor("to");
    setStatus(`Start: ${loc.name} — now tap or type destination`);
  };

  const pickToSuggestion = (loc: IndoorLocation) => {
    setToLoc(loc);
    setToText(loc.name);
    setToSuggestions([]);
    setSelectingFor(null);
    setStatus(`From: ${fromLoc?.name} → To: ${loc.name}`);
  };

  // ── Handle natural-language sentence route ────────────────────────────────
  const getRouteFromText = useCallback(async () => {
    if (!selected || !queryText.trim()) {
      Alert.alert("Type something", 'e.g. "I am in room 101 and I want to go to the exit"');
      return;
    }
    setLoading(true);
    setRoute(null);
    routeRequestRef.current = "";
    try {
      const q = queryText.trim();
      const res = await tryUrls("/indoor/route", () => ({
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
        body: JSON.stringify({ floor_plan_id: selected.id, query_text: q }),
      }));
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || `Route failed (${res.status})`);
      setRoute(json.data);
      setFromLoc(json.data.from_location);
      setToLoc(json.data.to_location);
      setFromText(json.data.from_location.name);
      setToText(json.data.to_location.name);
      setStatus(json.data.speech);
      speak(json.data.speech);
    } catch (err: any) {
      Alert.alert("Could not understand", err.message || "Try: 'I am in room 101 and want to go to the exit'");
    }
    setLoading(false);
  }, [selected, queryText]);

  // ── Get route ──────────────────────────────────────────────────────────────
  const buildLocalRoute = (floorPlan: FloorPlan, from: IndoorLocation, to: IndoorLocation): IndoorRoute => {
    const fromDoor = getComputedDoor(from);
    const toDoor = getComputedDoor(to);
    const path: PixelPoint[] = [from.point];

    if (fromDoor && (fromDoor.x !== from.point.x || fromDoor.y !== from.point.y)) {
      path.push(fromDoor);
    }

    if (toDoor) {
      const lastPoint = path[path.length - 1];
      if (lastPoint.x !== toDoor.x || lastPoint.y !== toDoor.y) {
        path.push(toDoor);
      }
    }

    const lastPoint = path[path.length - 1];
    if (lastPoint.x !== to.point.x || lastPoint.y !== to.point.y) {
      path.push(to.point);
    }

    const totalDistance = Math.round(path.reduce((sum, point, index) => {
      if (index === 0) return 0;
      const prev = path[index - 1];
      return sum + Math.hypot(point.x - prev.x, point.y - prev.y);
    }, 0) * 0.1 * 10) / 10;

    const instructions: string[] = [];
    if (fromDoor) instructions.push(`Leave ${from.name} through its door.`);
    if (toDoor) instructions.push(`Then go to the door of ${to.name}.`);
    instructions.push(`Finally enter ${to.name}.`);
    const speech = `${instructions.join(" ")} Approximately ${totalDistance} meters.`;

    return {
      floor_plan_name: floorPlan.name,
      from_location: from,
      to_location: to,
      path,
      steps: [
        {
          instruction: instructions.join(" "),
          distance_meters: totalDistance,
        },
      ],
      total_distance_meters: totalDistance,
      speech,
    };
  };

  const getRoute = useCallback(async () => {
    if (!selected || !fromLoc || !toLoc) {
      Alert.alert("Select locations", "Please select both a start and destination.");
      return;
    }

    const requestKey = `${selected.id}:${fromLoc.id}:${toLoc.id}`;
    if (routeRequestRef.current === requestKey) return;
    routeRequestRef.current = requestKey;

    setLoading(true);
    setRoute(null);

    try {
      const res  = await fetchBackend("/indoor/route", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
        body: JSON.stringify({
          floor_plan_id: selected.id,
          from_location_id: fromLoc.id,
          to_location_id: toLoc.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || `Route failed (${res.status})`);
      }

      setRoute(json.data);
      setStatus(json.data.speech);
      speak(json.data.speech);
    } catch (err: any) {
      console.warn("Route API failed, using local fallback route.", err);
      const localRoute = buildLocalRoute(selected, fromLoc, toLoc);
      setRoute(localRoute);
      setStatus(localRoute.speech);
      speak(localRoute.speech);
    }
    setLoading(false);
  }, [selected, fromLoc, toLoc]);

  // Auto-draw route when both start and end are chosen
  useEffect(() => {
    if (!selected || !fromLoc || !toLoc) return;
    if (fromLoc.id === toLoc.id) {
      setStatus("Start and destination must be different rooms.");
      return;
    }
    getRoute();
  }, [selected?.id, fromLoc?.id, toLoc?.id, getRoute]);

  // ── Speak ──────────────────────────────────────────────────────────────────
  const speak = (text: string) => {
    if (Platform.OS === "web" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    } else {
      Speech.stop();
      Speech.speak(text, { language: "en-US" });
    }
  };

  // ── Scale path points to display size ─────────────────────────────────────
  const scalePoint = (p: PixelPoint, imgW: number, imgH: number, dispW: number, dispH: number) => ({
    x: (p.x / imgW) * dispW,
    y: (p.y / imgH) * dispH,
  });

  const findNearestLocation = (
    tapX: number,
    tapY: number,
    dispW: number,
    dispH: number,
  ): IndoorLocation | null => {
    if (!selected) return null;

    let nearest: IndoorLocation | null = null;
    let minDist = Infinity;
    const threshold = Math.max(24, Math.min(dispW, dispH) * 0.08);

    for (const loc of selected.locations) {
      const pt = scalePoint(loc.point, selected.width, selected.height, dispW, dispH);
      const dist = Math.hypot(pt.x - tapX, pt.y - tapY);
      if (dist < minDist && dist <= threshold) {
        minDist = dist;
        nearest = loc;
      }
    }
    return nearest;
  };

  const getTapPoint = (tap: { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number; pageX?: number; pageY?: number }) => {
    const { locationX, locationY, offsetX, offsetY, pageX, pageY } = tap;
    if (locationX != null && locationY != null) return { x: locationX, y: locationY };
    if (offsetX != null && offsetY != null) return { x: offsetX, y: offsetY };
    if (pageX != null && pageY != null) return { x: pageX, y: pageY };
    return null;
  };

  const handleFloorPlanPress = (
    tapXOrEvent: number | { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number; pageX?: number; pageY?: number },
    tapYOrDispW: number,
    dispHOrUndefined?: number,
  ) => {
    const tap = typeof tapXOrEvent === "number"
      ? { locationX: tapXOrEvent, locationY: tapYOrDispW }
      : tapXOrEvent;
    const dispW = tapYOrDispW;
    const dispH = dispHOrUndefined;
    if (dispH == null) return;

    const point = getTapPoint(tap);
    if (!point) return;
    const loc = findNearestLocation(point.x, point.y, dispW, dispH);
    if (loc) tapLocation(loc);
  };

  // ── Render floor plan with SVG overlay ────────────────────────────────────
  const renderFloorPlan = () => {
    if (!selected) return null;

    const dispW = screenWidth - 32;
    const dispH = (selected.height / selected.width) * dispW;
    const routePoints = route && route.path.length >= 2
      ? route.path
          .map((pt) => scalePoint(pt, selected.width, selected.height, dispW, dispH))
          .map((pt) => `${pt.x},${pt.y}`)
          .join(" ")
      : "";

    return (
      <View style={[styles.floorPlanContainer, { width: dispW, height: dispH }]}>
        {/* Floor plan image */}
        <Image
          source={{ uri: selected.image_url }}
          style={{ width: dispW, height: dispH, position: "absolute" }}
          resizeMode="stretch"
        />

        {/* Tap layer — works reliably on web (SVG onPress often does not) */}
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFillObject}
          onPress={(e) => handleFloorPlanPress(e.nativeEvent, dispW, dispH)}
        >
          <Svg width={dispW} height={dispH} pointerEvents="none">
            {/* Route path */}
            {routePoints ? (
              <>
                <Polyline
                  points={routePoints}
                  fill="none"
                  stroke="#003399"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.35}
                />
                <Polyline
                  points={routePoints}
                  fill="none"
                  stroke="#0066FF"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : null}

            {/* Location markers */}
            {selected.locations.map((loc) => {
              const pt = scalePoint(loc.point, selected.width, selected.height, dispW, dispH);
              const isFrom = fromLoc?.id === loc.id;
              const isTo   = toLoc?.id   === loc.id;
              const color  = isFrom ? "#00aa00" : isTo ? "#cc0000" : categoryColor(loc.category);
              const radius = isFrom || isTo ? 12 : 8;

              let rectNode = null;
              if (loc.bounds) {
                const b1 = scalePoint({x: loc.bounds.x1, y: loc.bounds.y1}, selected.width, selected.height, dispW, dispH);
                const b2 = scalePoint({x: loc.bounds.x2, y: loc.bounds.y2}, selected.width, selected.height, dispW, dispH);
                rectNode = (
                  <Rect
                    x={b1.x} y={b1.y} width={Math.max(0, b2.x - b1.x)} height={Math.max(0, b2.y - b1.y)}
                    fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5}
                  />
                );
              }

              let doorNode = null;
              const doorPt = getComputedDoor(loc);
              if (doorPt) {
                 const sDoor = scalePoint(doorPt, selected.width, selected.height, dispW, dispH);
                 doorNode = (
                   <Rect
                     x={sDoor.x - 4} y={sDoor.y - 4} width={8} height={8}
                     fill="#8B4513" stroke="#fff" strokeWidth={1}
                   />
                 );
              }

              return (
                <React.Fragment key={loc.id}>
                  {rectNode}
                  <Circle
                    cx={pt.x} cy={pt.y}
                    r={radius}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={2}
                    onPress={() => tapLocation(loc)}
                    cursor="pointer"
                  />
                  {doorNode}
                  <SvgText
                    x={pt.x} y={pt.y - radius - 4}
                    fontSize={10}
                    fill="#000"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {loc.name}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🏢 Indoor Navigation</Text>
          <Text style={styles.headerSub}>Navigate inside buildings using floor plans</Text>
        </View>

        {/* Status */}
        <Text style={styles.status}>{status}</Text>

        {/* Floor plan selector */}
        {floorPlans.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.planList}>
            {floorPlans.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planChip, selected?.id === plan.id && styles.planChipActive]}
                onPress={() => selectFloorPlan(plan)}
              >
                <Text style={[styles.planChipText, selected?.id === plan.id && styles.planChipTextActive]}>
                  🏢 {plan.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Upload button */}
        <TouchableOpacity style={styles.uploadBtn} onPress={() => setShowUpload(true)}>
          <Text style={styles.uploadBtnText}>➕ Upload Floor Plan</Text>
        </TouchableOpacity>

        {/* Action buttons — shown when a floor plan is selected */}
        {selected && (
          <View style={styles.actionRow}>
            {/* Reset location button */}
            <TouchableOpacity style={styles.resetLocBtn} onPress={reset}>
              <Text style={styles.resetLocIcon}>↺</Text>
              <Text style={styles.resetLocText}>Reset Location</Text>
            </TouchableOpacity>

            {/* Delete floor plan button */}
            <TouchableOpacity style={styles.deleteBtn} onPress={deleteFloorPlan}>
              <Text style={styles.deleteIcon}>🗑️</Text>
              <Text style={styles.deleteText}>Delete Floor Plan</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Floor plan with overlay */}
        {selected && (
          <View style={styles.mapSection}>
            {renderFloorPlan()}

            {/* Area info panel */}
            <View style={styles.areaPanel}>
              <Text style={styles.areaPanelTitle}>📐 Room Areas</Text>
              <View style={styles.areaGrid}>
                {selected.locations.map((loc) => {
                  // Extract area from name like "Room 101 (8.5 m²)"
                  const match = loc.name.match(/\(([0-9.]+)\s*m/);
                  const area  = match ? parseFloat(match[1]) : null;
                  const over  = area !== null && area > 20;
                  return (
                    <View key={loc.id} style={[styles.areaChip, over && styles.areaChipOver]}>
                      <Text style={[styles.areaChipText, over && styles.areaChipTextOver]}>
                        {loc.name.replace(/\s*\(.*\)/, "")}
                      </Text>
                      {area !== null && (
                        <Text style={[styles.areaChipVal, over && styles.areaChipValOver]}>
                          {area} m² {over ? "⚠️" : "✓"}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
              {selected.locations.some((loc) => {
                const match = loc.name.match(/\(([0-9.]+)\s*m/);
                return match && parseFloat(match[1]) > 20;
              }) && (
                <Text style={styles.areaWarning}>
                  ⚠️ Some rooms exceed 20 m² limit
                </Text>
              )}
            </View>

            {/* Legend */}
            <View style={styles.legend}>
              <Text style={styles.legendTitle}>Tap two room dots — route draws automatically:</Text>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: "#00aa00" }]} />
                <Text style={styles.legendText}>Start</Text>
                <View style={[styles.legendDot, { backgroundColor: "#cc0000" }]} />
                <Text style={styles.legendText}>End</Text>
                <View style={[styles.legendDot, { backgroundColor: "#0066FF" }]} />
                <Text style={styles.legendText}>Room</Text>
                <View style={[styles.legendDot, { backgroundColor: "#cc0000" }]} />
                <Text style={styles.legendText}>Exit</Text>
              </View>
            </View>

            {/* From / To inputs */}
            <View style={styles.routeRow}>
              {/* FROM input */}
              <View style={{ flex: 1 }}>
                <View style={[
                  styles.routeBox,
                  selectingFor === "from" && styles.routeBoxActive,
                ]}>
                  <Text style={styles.routeLabel}>FROM</Text>
                  <TextInput
                    style={styles.routeInput}
                    placeholder="Type or tap on map"
                    placeholderTextColor="#aaa"
                    value={fromText}
                    onChangeText={handleFromTextChange}
                    onFocus={() => setSelectingFor("from")}
                  />
                </View>
                {fromSuggestions.length > 0 && (
                  <View style={styles.suggestionBox}>
                    {fromSuggestions.map((loc) => (
                      <TouchableOpacity
                        key={loc.id}
                        style={styles.suggestionItem}
                        onPress={() => pickFromSuggestion(loc)}
                      >
                        <Text style={styles.suggestionText}>
                          {categoryIcon(loc.category)} {loc.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <Text style={styles.routeArrow}>→</Text>

              {/* TO input */}
              <View style={{ flex: 1 }}>
                <View style={[
                  styles.routeBox,
                  selectingFor === "to" && styles.routeBoxActive,
                ]}>
                  <Text style={styles.routeLabel}>TO</Text>
                  <TextInput
                    style={styles.routeInput}
                    placeholder="Type or tap on map"
                    placeholderTextColor="#aaa"
                    value={toText}
                    onChangeText={handleToTextChange}
                    onFocus={() => setSelectingFor("to")}
                  />
                </View>
                {toSuggestions.length > 0 && (
                  <View style={styles.suggestionBox}>
                    {toSuggestions.map((loc) => (
                      <TouchableOpacity
                        key={loc.id}
                        style={styles.suggestionItem}
                        onPress={() => pickToSuggestion(loc)}
                      >
                        <Text style={styles.suggestionText}>
                          {categoryIcon(loc.category)} {loc.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* ── Voice input + sentence input ── */}
            <View style={styles.voiceBox}>

              {/* Mic button */}
              <View style={styles.voiceRow}>
                <TouchableOpacity
                  style={[
                    styles.micBtn,
                    isRecording   && styles.micBtnRecording,
                    recorderState === "processing" && styles.micBtnProcessing,
                  ]}
                  onPress={toggleMic}
                  disabled={recorderState === "processing" || loading}
                >
                  {recorderState === "processing" ? (
                    <ActivityIndicator color="#fff" size="large" />
                  ) : (
                    <Text style={styles.micIcon}>{isRecording ? "⏹" : "🎤"}</Text>
                  )}
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text style={styles.voiceTitle}>
                    {isRecording
                      ? "🔴 Listening... tap ⏹ to stop"
                      : recorderState === "processing"
                      ? "🔄 Processing your voice..."
                      : "🎤 Tap mic and say your route"}
                  </Text>
                  <Text style={styles.voiceHint}>
                    {`e.g. "I am in room one and I want to go to room three"`}
                  </Text>
                  {voiceStatus ? (
                    <Text style={styles.voiceStatus}>{voiceStatus}</Text>
                  ) : null}
                </View>
              </View>

              {/* Divider */}
              <View style={styles.voiceDivider}>
                <View style={styles.voiceDividerLine} />
                <Text style={styles.voiceDividerText}>or type</Text>
                <View style={styles.voiceDividerLine} />
              </View>

              {/* Text sentence input */}
              <View style={styles.nlpRow}>
                <TextInput
                  style={styles.nlpInput}
                  placeholder={'e.g. "I am in room 101 and I want to go to the exit"'}
                  placeholderTextColor="#aaa"
                  value={queryText}
                  onChangeText={setQueryText}
                  multiline={false}
                  returnKeyType="go"
                  onSubmitEditing={getRouteFromText}
                />
                <TouchableOpacity
                  style={[styles.nlpBtn, (!queryText.trim() || loading) && styles.routeBtnDisabled]}
                  onPress={getRouteFromText}
                  disabled={!queryText.trim() || loading}
                >
                  <Text style={styles.nlpBtnText}>Go</Text>
                </TouchableOpacity>
              </View>

            </View>

            {/* Get Route button */}
            <TouchableOpacity
              style={[styles.routeBtn, (!fromLoc || !toLoc || loading) && styles.routeBtnDisabled]}
              onPress={getRoute}
              disabled={!fromLoc || !toLoc || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.routeBtnText}>🗺️ Get Indoor Route</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Route result */}
        {route && (
          <View style={styles.routeResult}>
            <View style={styles.routeSummary}>
              <Text style={styles.routeSummaryText}>
                📍 {route.from_location.name} → {route.to_location.name}
              </Text>
              <Text style={styles.routeDistance}>
                🚶 {route.total_distance_meters.toFixed(0)} metres
              </Text>
            </View>

            <Text style={styles.stepsTitle}>Directions:</Text>
            {route.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step.instruction}</Text>
              </View>
            ))}

            <TouchableOpacity style={styles.speakBtn} onPress={() => speak(route.speech)}>
              <Text style={styles.speakBtnText}>🔊 Repeat Directions</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state */}
        {floorPlans.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏢</Text>
            <Text style={styles.emptyTitle}>No floor plans yet</Text>
            <Text style={styles.emptySub}>
              Tap "Upload Floor Plan" to add a building map.{"\n"}
              Then mark rooms, exits, and stairs on it.
            </Text>
          </View>
        )}

      </ScrollView>

      {/* Upload Modal */}
      <UploadModal
        visible={showUpload}
        onClose={() => setShowUpload(false)}
        onSaved={(plan) => {
          setShowUpload(false);
          loadFloorPlans();
          if (plan) selectFloorPlan(plan);
        }}
      />
    </View>
  );
}

// ── Upload & Location Editor Modal ───────────────────────────────────────────
// 3-step wizard:
//   Step 1: Enter name + pick image
//   Step 2: Tap on the image to place named location dots
//   Step 3: Save everything to backend

const CATEGORIES = ["room", "exit", "stairs", "elevator", "toilet"] as const;

function UploadModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (plan: FloorPlan) => void;
}) {
  const [step, setStep]           = useState<1 | 2 | 3>(1);
  const [name, setName]           = useState("");
  const [corridorY, setCorridorY] = useState("300");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl]   = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ w: 800, h: 600 });
  const [displaySize, setDisplaySize] = useState({ w: 300, h: 200 });
  const [locations, setLocations] = useState<IndoorLocation[]>([]);
  const [pendingName, setPendingName] = useState("");
  const [pendingCat, setPendingCat]   = useState<string>("room");
  const [pendingPt, setPendingPt]     = useState<PixelPoint | null>(null);
  const [manualX, setManualX]   = useState("");
  const [manualY, setManualY]   = useState("");
  // Door inputs
  const [doorX, setDoorX]       = useState("");
  const [doorY, setDoorY]       = useState("");
  const [doorSide, setDoorSide] = useState<string>("bottom");
  const [doorPosition, setDoorPosition] = useState<string>("center");
  // Bounds inputs
  const [bx1, setBx1] = useState("");
  const [by1, setBy1] = useState("");
  const [bx2, setBx2] = useState("");
  const [by2, setBy2] = useState("");
  // Area
  const [areaM2, setAreaM2] = useState("");
  const [loading, setLoading]     = useState(false);
  const fileInputRef = useRef<any>(null);
  const imgRef       = useRef<any>(null);

  const reset = () => {
    setStep(1); setName(""); setImageFile(null); setImageUrl(null);
    setLocations([]); setPendingPt(null); setPendingName(""); setPendingCat("room");
    setManualX(""); setManualY("");
  };

  const handleClose = () => { reset(); onClose(); };

  const pickMobileImage = async () => {
    if (!name.trim()) { Alert.alert("Name required", "Enter a name first."); return; }
    
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setImageUrl(asset.uri);
      
      const filename = asset.uri.split('/').pop() || "mobile_image.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;
      
      const fileObj = {
        uri: asset.uri,
        name: filename,
        type: type,
      } as any;
      
      setImageFile(fileObj);
      setImageSize({ w: asset.width, h: asset.height });
      setStep(2);
    }
  };

  // Step 1 → 2: pick image
  const handleImagePick = (file: File) => {
    if (!name.trim()) { Alert.alert("Name required", "Enter a name first."); return; }
    const url = URL.createObjectURL(file);
    setImageFile(file);
    setImageUrl(url);
    // Get image dimensions
    const img = new (window as any).Image();
    img.onload = () => setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    setStep(2);
  };

  // Step 2: tap on image → place dot
  const handleImageTap = (e: any) => {
    let px, py;
    if (Platform.OS === "web") {
      const rect = e.currentTarget.getBoundingClientRect();
      const scaleX = imageSize.w / rect.width;
      const scaleY = imageSize.h / rect.height;
      px = Math.round((e.clientX - rect.left) * scaleX);
      py = Math.round((e.clientY - rect.top)  * scaleY);
    } else {
      const { locationX, locationY } = e.nativeEvent;
      const scaleX = imageSize.w / displaySize.w;
      const scaleY = imageSize.h / displaySize.h;
      px = Math.round(locationX * scaleX);
      py = Math.round(locationY * scaleY);
    }
    
    if (!pendingPt) {
      setPendingPt({ x: px, y: py });
    } else if (!bx1 && !by1) {
      setBx1(String(px));
      setBy1(String(py));
    } else if (!bx2 && !by2) {
      setBx2(String(px));
      setBy2(String(py));
    }
  };

  // Add location
  const addLocation = () => {
    if (!pendingName.trim()) { Alert.alert("Name required", "Enter the room name."); return; }
    const x = parseInt(pendingPt ? String(pendingPt.x) : manualX, 10);
    const y = parseInt(pendingPt ? String(pendingPt.y) : manualY, 10);
    if (isNaN(x) || isNaN(y)) { Alert.alert("Invalid", "Enter valid X and Y numbers or tap the map."); return; }

    const dx = parseInt(doorX, 10);
    const dy = parseInt(doorY, 10);
    const door = (!isNaN(dx) && !isNaN(dy)) ? { x: dx, y: dy } : null;

    const b1x = parseInt(bx1, 10), b1y = parseInt(by1, 10);
    const b2x = parseInt(bx2, 10), b2y = parseInt(by2, 10);
    const bounds = (!isNaN(b1x) && !isNaN(b1y) && !isNaN(b2x) && !isNaN(b2y))
      ? { x1: Math.min(b1x, b2x), y1: Math.min(b1y, b2y), x2: Math.max(b1x, b2x), y2: Math.max(b1y, b2y) } : null;

    if (!bounds) {
      Alert.alert(
        "Room perimeter required",
        "Tap the image three times to set the room centre and two corner points, or fill in all four bound values before saving.",
      );
      return;
    }

    const area = parseFloat(areaM2) || undefined;

    const id = pendingName.toLowerCase().replace(/\s+/g, "-") + "-" + locations.length;
    const displayName = area ? `${pendingName.trim()} (${area} m²)` : pendingName.trim();

    setLocations((prev) => [...prev, {
      id,
      name: displayName,
      point: { x, y },
      door: door || undefined,
      door_side: (doorSide as any) || undefined,
      door_position: (doorPosition as any) || undefined,
      bounds,
      category: pendingCat,
      area_m2: area,
    }]);
    setPendingName(""); setPendingCat("room");
    setManualX(""); setManualY(""); setPendingPt(null);
    setDoorX(""); setDoorY(""); setDoorSide("bottom"); setDoorPosition("center");
    setBx1(""); setBy1(""); setBx2(""); setBy2("");
    setAreaM2("");
  };

  // Remove a location
  const removeLocation = (id: string) =>
    setLocations(locations.filter((l) => l.id !== id));

  // Step 3: save to backend
  const handleSave = async () => {
    if (!imageFile) {
      Alert.alert('Image required', 'Please choose an image before saving.');
      return;
    }
    if (locations.length < 1) {
      Alert.alert('Need at least one location', 'Add at least one location before saving the floor plan.');
      return;
    }
    const missingBounds = locations.filter((loc) => !loc.bounds || !loc.door_side);
    if (missingBounds.length > 0) {
      Alert.alert(
        'Room setup incomplete',
        'Each room needs a perimeter (tap 3 times on the image for center + corners) and a door wall before saving.',
      );
      return;
    }
    setLoading(true);
    try {
      const res = await tryUrls("/indoor/floor-plan", () => {
        const formData = new FormData();
        formData.append("name", name.trim());
        formData.append("corridor_y", corridorY || "300");
        formData.append("width", String(imageSize.w));
        formData.append("height", String(imageSize.h));
        formData.append("locations_json", JSON.stringify(locations));
        formData.append("image", imageFile as any);

        return {
          method: "POST",
          headers: { "X-API-Key": API_KEY },
          body: formData,
        };
      });
      console.log('Response status:', res.status);
      let json: any = null;
      const text = await res.text();
      try {
        json = JSON.parse(text);
      } catch {
        // ignore JSON parse errors
      }
      if (!res.ok) {
        const errMsg = json?.message || text || `Server responded with ${res.status}`;
        throw new Error(errMsg);
      }
      if (!json?.success) {
        throw new Error(json?.message || "Save failed, unknown response");
      }

      Alert.alert("✅ Saved", `Floor plan "${name}" saved with ${locations.length} locations. Tap two rooms on the map to see the route.`);
      reset();
      onSaved(json.data as FloorPlan);
    } catch (err: any) {
      console.error('Save error:', err);

      if (typeof window !== "undefined" && imageUrl) {
        const localPlan: FloorPlan = {
          id: `local-${Date.now()}`,
          name: name.trim(),
          image_url: imageUrl,
          width: imageSize.w,
          height: imageSize.h,
          locations,
        };
        const storedPlans = getStoredFloorPlans();
        saveStoredFloorPlans([...storedPlans, localPlan]);

        Alert.alert(
          "Saved locally",
          `Floor plan "${name}" was saved locally because the backend could not be reached. It will appear in the list now.`,
        );
        reset();
        onSaved(localPlan);
      } else {
        Alert.alert("Error", err.message || "Unknown error while saving.");
      }
    }
    setLoading(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, step === 2 && styles.modalBoxLarge]}>

          {/* ── Step 1: Name + corridor Y + image ── */}
          {step === 1 && (
            <>
              <Text style={styles.modalTitle}>➕ Upload Floor Plan</Text>
              <Text style={styles.modalSub}>Step 1 — Enter name and choose image</Text>

              <TextInput
                style={styles.modalInput}
                placeholder="Floor plan name, e.g. Building A - Floor 1"
                placeholderTextColor="#999"
                value={name}
                onChangeText={setName}
              />

              <View style={styles.coordRow}>
                <View style={styles.coordField}>
                  <Text style={styles.coordLabel}>Corridor Centre Y (pixels)</Text>
                  <TextInput
                    style={styles.coordInput}
                    placeholder="300"
                    placeholderTextColor="#bbb"
                    value={corridorY}
                    onChangeText={setCorridorY}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Text style={styles.coordHint}>
                Y position of the middle of the corridor (default: 300)
              </Text>

              {Platform.OS === "web" ? (
                <>
                  <TouchableOpacity
                    style={styles.modalSaveBtn}
                    onPress={() => fileInputRef.current?.click()}
                  >
                    <Text style={styles.modalSaveText}>📷 Choose Image → Next</Text>
                  </TouchableOpacity>
                  {React.createElement("input", {
                    ref: fileInputRef,
                    type: "file",
                    accept: "image/*",
                    style: { display: "none" },
                    onChange: (e: any) => { const f = e.target.files?.[0]; if (f) handleImagePick(f); }
                  })}
                </>
              ) : (
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={pickMobileImage}
                >
                  <Text style={styles.modalSaveText}>📷 Choose Image from Gallery → Next</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.modalCancelBtn} onPress={handleClose}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Step 2: Tap image to add locations ── */}
          {step === 2 && imageUrl && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>📍 Add Locations</Text>
              <Text style={styles.modalSub}>
                Tap once for the room centre, then tap two more times to mark the room perimeter corners.
              </Text>

              {/* ── Name input FIRST (always visible at top) ── */}
              <View style={styles.pendingBox}>
                {/* Coordinates display */}
                {pendingPt ? (
                  <Text style={styles.pendingTitle}>
                    📌 Tapped: Center={pendingPt.x},{pendingPt.y} | Bounds: {bx1},{by1} - {bx2},{by2}
                  </Text>
                ) : (
                  <Text style={[styles.pendingTitle, { color: "#0066FF" }]}>
                    👆 Tap image to place dot  — OR — type coordinates below
                  </Text>
                )}

                {/* Room name */}
                <TextInput
                  style={styles.modalInput}
                  placeholder="Room name, e.g. Room 101, Main Exit, Stairs..."
                  placeholderTextColor="#999"
                  value={pendingName}
                  onChangeText={setPendingName}
                />

                {/* Manual X / Y coordinate inputs */}
                <View style={styles.coordRow}>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>X (pixels from left)</Text>
                    <TextInput
                      style={styles.coordInput}
                      placeholder={`0 – ${imageSize.w}`}
                      placeholderTextColor="#bbb"
                      value={pendingPt ? String(pendingPt.x) : manualX}
                      onChangeText={(v) => { setManualX(v); setPendingPt(null); }}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>Y (pixels from top)</Text>
                    <TextInput
                      style={styles.coordInput}
                      placeholder={`0 – ${imageSize.h}`}
                      placeholderTextColor="#bbb"
                      value={pendingPt ? String(pendingPt.y) : manualY}
                      onChangeText={(v) => { setManualY(v); setPendingPt(null); }}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Image size hint */}
                <Text style={styles.coordHint}>
                  Image size: {imageSize.w} × {imageSize.h} px
                  {" · "}Top-left = (0,0), Bottom-right = ({imageSize.w},{imageSize.h})
                </Text>

                {/* Category */}
                <View style={styles.catRow}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, pendingCat === cat && styles.catChipActive]}
                      onPress={() => setPendingCat(cat)}
                    >
                      <Text style={[styles.catText, pendingCat === cat && styles.catTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* ── Door position ── */}
                <Text style={[styles.coordLabel, { marginTop: 8, marginBottom: 4 }]}>
                  🚪 Door position (where the door is on the wall):
                </Text>
                <View style={styles.coordRow}>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>Door X</Text>
                    <TextInput style={styles.coordInput} placeholder="e.g. 295"
                      placeholderTextColor="#bbb" value={doorX} onChangeText={setDoorX}
                      keyboardType="numeric" />
                  </View>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>Door Y</Text>
                    <TextInput style={styles.coordInput} placeholder="e.g. 250"
                      placeholderTextColor="#bbb" value={doorY} onChangeText={setDoorY}
                      keyboardType="numeric" />
                  </View>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>Door wall</Text>
                    <View style={styles.catRow}>
                      {(["top","bottom","left","right"] as const).map((side) => (
                        <TouchableOpacity key={side}
                          style={[styles.catChip, doorSide === side && styles.catChipActive]}
                          onPress={() => setDoorSide(side)}>
                          <Text style={[styles.catText, doorSide === side && styles.catTextActive]}>
                            {side}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>Position</Text>
                    <View style={styles.catRow}>
                      {(["left","center","right"] as const).map((pos) => (
                        <TouchableOpacity key={pos}
                          style={[styles.catChip, doorPosition === pos && styles.catChipActive]}
                          onPress={() => setDoorPosition(pos)}>
                          <Text style={[styles.catText, doorPosition === pos && styles.catTextActive]}>
                            {pos}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                {/* ── Room bounds (perimeter) ── */}
                <Text style={[styles.coordLabel, { marginTop: 8, marginBottom: 4 }]}>
                  📐 Room perimeter (bounding box):
                </Text>
                <View style={styles.coordRow}>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>Left (x1)</Text>
                    <TextInput style={styles.coordInput} placeholder="x1"
                      placeholderTextColor="#bbb" value={bx1} onChangeText={setBx1}
                      keyboardType="numeric" />
                  </View>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>Top (y1)</Text>
                    <TextInput style={styles.coordInput} placeholder="y1"
                      placeholderTextColor="#bbb" value={by1} onChangeText={setBy1}
                      keyboardType="numeric" />
                  </View>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>Right (x2)</Text>
                    <TextInput style={styles.coordInput} placeholder="x2"
                      placeholderTextColor="#bbb" value={bx2} onChangeText={setBx2}
                      keyboardType="numeric" />
                  </View>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>Bottom (y2)</Text>
                    <TextInput style={styles.coordInput} placeholder="y2"
                      placeholderTextColor="#bbb" value={by2} onChangeText={setBy2}
                      keyboardType="numeric" />
                  </View>
                </View>

                {/* ── Area ── */}
                <View style={styles.coordRow}>
                  <View style={styles.coordField}>
                    <Text style={styles.coordLabel}>Area (m²) — optional</Text>
                    <TextInput style={styles.coordInput} placeholder="e.g. 12.5"
                      placeholderTextColor="#bbb" value={areaM2} onChangeText={setAreaM2}
                      keyboardType="decimal-pad" />
                  </View>
                </View>

                {/* Add buttons */}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.modalSaveBtn, { flex: 1 }]}
                    onPress={addLocation}
                  >
                    <Text style={styles.modalSaveText}>✅ Add Location</Text>
                  </TouchableOpacity>
                  {(pendingPt || manualX || manualY) && (
                    <TouchableOpacity
                      style={[styles.modalCancelBtn, { flex: 0.5 }]}
                      onPress={() => { setPendingPt(null); setManualX(""); setManualY(""); setBx1(""); setBy1(""); setBx2(""); setBy2(""); }}
                    >
                      <Text style={styles.modalCancelText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Locations added so far */}
              {locations.length > 0 && (
                <View style={styles.locList}>
                  <Text style={styles.locListTitle}>
                    ✅ {locations.length} location{locations.length !== 1 ? "s" : ""} added
                    {" — tap dot on image to remove"}
                  </Text>
                  {locations.map((loc, i) => (
                    <View key={loc.id} style={styles.locRow}>
                      <View style={[styles.locDot, {
                        backgroundColor: loc.category === "exit" ? "#cc0000" : "#0066FF"
                      }]}>
                        <Text style={styles.locDotText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.locName}>{loc.name}</Text>
                      <Text style={styles.locCat}>{loc.category}</Text>
                      <TouchableOpacity onPress={() => removeLocation(loc.id)}>
                        <Text style={{ color: "#cc0000", fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Floor plan image — tap to place dot */}
              <TouchableOpacity
                activeOpacity={1}
                onLayout={(e) => setDisplaySize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
                style={{ position: "relative", marginBottom: 10, width: "100%", aspectRatio: imageSize.w / imageSize.h }}
                onPress={handleImageTap}
              >
                <Image
                  source={{ uri: imageUrl }}
                  style={{ width: "100%", height: "100%", borderRadius: 8, borderWidth: 2, borderColor: "#0066FF" }}
                />
                
                {/* Existing location dots */}
                {locations.map((loc, i) => {
                  const px = (loc.point.x / imageSize.w) * displaySize.w;
                  const py = (loc.point.y / imageSize.h) * displaySize.h;
                  return (
                    <TouchableOpacity
                      key={loc.id}
                      style={{
                        position: "absolute", left: px - 10, top: py - 10,
                        width: 20, height: 20, borderRadius: 10,
                        backgroundColor: loc.category === "exit" ? "#cc0000" : "#0066FF",
                        borderWidth: 2, borderColor: "white",
                        justifyContent: "center", alignItems: "center",
                        zIndex: 10,
                        elevation: 4,
                        shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }
                      }}
                      onPress={() => removeLocation(loc.id)}
                    >
                      <Text style={{ color: "white", fontSize: 9, fontWeight: "bold" }}>{i+1}</Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Pending dot (orange = not named yet) */}
                {pendingPt && (
                  <View style={{
                    position: "absolute",
                    left: (pendingPt.x / imageSize.w) * displaySize.w - 10,
                    top:  (pendingPt.y / imageSize.h) * displaySize.h - 10,
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: "#FF6600", borderWidth: 2, borderColor: "white",
                    zIndex: 10, elevation: 4,
                    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }
                  }} />
                )}

                {/* Pending perimeter drawing */}
                {bx1 && by1 && (
                  <View style={{
                    position: "absolute",
                    left: (Math.min(parseInt(bx1,10), parseInt(bx2||bx1,10)) / imageSize.w) * displaySize.w,
                    top: (Math.min(parseInt(by1,10), parseInt(by2||by1,10)) / imageSize.h) * displaySize.h,
                    width: (Math.abs(parseInt(bx2||bx1,10) - parseInt(bx1,10)) / imageSize.w) * displaySize.w,
                    height: (Math.abs(parseInt(by2||by1,10) - parseInt(by1,10)) / imageSize.h) * displaySize.h,
                    backgroundColor: "rgba(255, 102, 0, 0.2)",
                    borderWidth: 2, borderColor: "#FF6600", borderStyle: "dashed",
                    zIndex: 5,
                  }} pointerEvents="none" />
                )}
              </TouchableOpacity>

              {/* Save / Back */}
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setStep(1)}>
                  <Text style={styles.modalCancelText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalSaveBtn,
                    { flex: 2 },
                    loading && styles.modalSaveBtnDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.modalSaveText}>
                        💾 Save ({locations.length} location{locations.length !== 1 ? "s" : ""})
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9ff" },

  header: { padding: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#003399" },
  headerSub: { fontSize: 13, color: "#666", marginTop: 2 },

  status: {
    fontSize: 13, color: "#555", fontStyle: "italic",
    textAlign: "center", marginHorizontal: 16, marginBottom: 8, minHeight: 18,
  },

  planList: { paddingHorizontal: 16, marginBottom: 8 },
  planChip: {
    backgroundColor: "#e8f0ff", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
  },
  planChipActive: { backgroundColor: "#0066FF" },
  planChipText: { color: "#0066FF", fontSize: 13, fontWeight: "600" },
  planChipTextActive: { color: "#fff" },

  uploadBtn: {
    marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1.5, borderColor: "#0066FF", borderRadius: 12,
    padding: 12, alignItems: "center",
  },
  uploadBtnText: { color: "#0066FF", fontSize: 14, fontWeight: "600" },

  mapSection: { paddingHorizontal: 16, marginBottom: 16 },

  floorPlanContainer: {
    borderRadius: 12, overflow: "hidden",
    borderWidth: 1, borderColor: "#ddd",
    marginBottom: 12,
  },

  legend: { marginBottom: 10 },
  legendTitle: { fontSize: 12, color: "#666", marginBottom: 4 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: "#555", marginRight: 8 },

  routeRow: {
    flexDirection: "row", alignItems: "center",
    gap: 8, marginBottom: 10,
  },
  routeBox: {
    flex: 1, backgroundColor: "#fff", borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: "#ddd",
  },
  routeLabel: { fontSize: 10, color: "#888", fontWeight: "700", marginBottom: 2 },
  routeValue: { fontSize: 13, color: "#111", fontWeight: "600" },
  routeInput: {
    fontSize: 13, color: "#111", fontWeight: "600",
    paddingVertical: 2, minHeight: 22,
  },
  routeBoxActive: {
    borderColor: "#0066FF", borderWidth: 2,
  },

  suggestionBox: {
    backgroundColor: "#fff", borderRadius: 8,
    borderWidth: 1, borderColor: "#dce8ff",
    marginTop: 2, zIndex: 99,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 4,
  },
  suggestionItem: {
    paddingVertical: 8, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: "#f0f0f0",
  },
  suggestionText: { fontSize: 13, color: "#333" },

  nlpBox: {
    backgroundColor: "#f0f5ff", borderRadius: 12,
    padding: 12, marginBottom: 10,
  },
  nlpLabel: { fontSize: 12, color: "#555", marginBottom: 6 },
  nlpRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  nlpInput: {
    flex: 1, backgroundColor: "#fff", borderRadius: 10,
    borderWidth: 1, borderColor: "#c0d4ff",
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, color: "#111",
  },
  nlpBtn: {
    backgroundColor: "#0066FF", borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  nlpBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // ── Voice input styles ────────────────────────────────────────────────────
  voiceBox: {
    backgroundColor: "#f0f5ff", borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: "#d0e2ff",
  },
  voiceRow: {
    flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12,
  },
  micBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#0066FF",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#0066FF", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  micBtnRecording: { backgroundColor: "#cc0000" },
  micBtnProcessing: { backgroundColor: "#888" },
  micIcon: { fontSize: 28 },
  voiceTitle: { fontSize: 13, fontWeight: "700", color: "#003399", marginBottom: 3 },
  voiceHint: { fontSize: 11, color: "#666", fontStyle: "italic" },
  voiceStatus: {
    fontSize: 12, color: "#333", marginTop: 4,
    backgroundColor: "#fff", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  voiceDivider: {
    flexDirection: "row", alignItems: "center", marginBottom: 10,
  },
  voiceDividerLine: { flex: 1, height: 1, backgroundColor: "#c0d4ff" },
  voiceDividerText: { marginHorizontal: 8, fontSize: 11, color: "#888" },

  routeArrow: { fontSize: 20, color: "#0066FF" },

  routeBtn: {
    backgroundColor: "#0066FF", borderRadius: 12,
    padding: 14, alignItems: "center",
  },
  routeBtnDisabled: { backgroundColor: "#99bbff" },
  routeBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  routeResult: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  routeSummary: { marginBottom: 12 },
  routeSummaryText: { fontSize: 15, fontWeight: "700", color: "#003399" },
  routeDistance: { fontSize: 13, color: "#555", marginTop: 4 },

  stepsTitle: { fontSize: 13, fontWeight: "700", color: "#333", marginBottom: 8 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  stepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#0066FF", justifyContent: "center", alignItems: "center",
  },
  stepNumText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  stepText: { flex: 1, fontSize: 13, color: "#222", lineHeight: 18 },

  speakBtn: {
    backgroundColor: "#e8f0ff", borderRadius: 10,
    padding: 10, alignItems: "center", marginTop: 8,
  },
  speakBtnText: { color: "#0066FF", fontSize: 14, fontWeight: "600" },

  emptyState: {
    alignItems: "center", padding: 40,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#333", marginBottom: 8 },
  emptySub: { fontSize: 14, color: "#888", textAlign: "center", lineHeight: 22 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#003399", marginBottom: 8 },
  modalSub: { fontSize: 13, color: "#666", marginBottom: 16, lineHeight: 20 },
  modalInput: {
    borderWidth: 1.5, borderColor: "#ddd", borderRadius: 12,
    padding: 12, fontSize: 15, color: "#000", marginBottom: 12,
  },
  modalSaveBtn: {
    backgroundColor: "#0066FF", borderRadius: 12,
    padding: 14, alignItems: "center", marginBottom: 8,
  },
  modalSaveBtnDisabled: { backgroundColor: "#99bbff" },
  modalSaveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  modalCancelBtn: {
    borderWidth: 1.5, borderColor: "#ddd", borderRadius: 12,
    padding: 14, alignItems: "center",
  },
  modalCancelText: { color: "#888", fontSize: 15 },
  modalButtons: { flexDirection: "row", gap: 8, marginTop: 8 },

  // ── Wizard styles ──
  modalBoxLarge: { maxHeight: "95%" },
  pendingBox: {
    backgroundColor: "#fff8e1", borderRadius: 12, padding: 12,
    marginBottom: 10, borderWidth: 1, borderColor: "#ffe082",
  },
  pendingTitle: { fontSize: 13, fontWeight: "700", color: "#555", marginBottom: 8 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  catChip: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  catChipActive: { backgroundColor: "#0066FF", borderColor: "#0066FF" },
  catText: { fontSize: 12, color: "#555" },
  catTextActive: { color: "#fff", fontWeight: "700" },
  locList: { marginBottom: 10 },
  locListTitle: { fontSize: 12, color: "#666", marginBottom: 6 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  locDot: {
    width: 22, height: 22, borderRadius: 11,
    justifyContent: "center", alignItems: "center",
  },
  locDotText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  locName: { flex: 1, fontSize: 13, color: "#222" },
  locCat: { fontSize: 11, color: "#888" },

  // ── Action buttons ──
  actionRow: {
    flexDirection: "row", gap: 10,
    marginHorizontal: 16, marginBottom: 12,
  },
  resetLocBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff3e0", borderRadius: 12,
    padding: 12, gap: 6,
    borderWidth: 1.5, borderColor: "#FF6600",
  },
  resetLocIcon: { fontSize: 18 },
  resetLocText: { color: "#FF6600", fontSize: 13, fontWeight: "700" },

  deleteBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff0f0", borderRadius: 12,
    padding: 12, gap: 6,
    borderWidth: 1.5, borderColor: "#cc0000",
  },
  deleteIcon: { fontSize: 16 },
  deleteText: { color: "#cc0000", fontSize: 13, fontWeight: "700" },

  // ── Area panel ──
  areaPanel: {
    backgroundColor: "#fff", borderRadius: 12, padding: 12,
    marginBottom: 10,
    borderWidth: 1, borderColor: "#eee",
  },
  areaPanelTitle: { fontSize: 13, fontWeight: "700", color: "#333", marginBottom: 8 },
  areaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  areaChip: {
    backgroundColor: "#f0f6ff", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: "#c8dcff",
    alignItems: "center",
  },
  areaChipOver: { backgroundColor: "#fff0f0", borderColor: "#ffaaaa" },
  areaChipText: { fontSize: 11, color: "#003399", fontWeight: "600" },
  areaChipTextOver: { color: "#cc0000" },
  areaChipVal: { fontSize: 11, color: "#0066FF", marginTop: 2 },
  areaChipValOver: { color: "#cc0000" },
  areaWarning: {
    fontSize: 12, color: "#cc0000", fontWeight: "600",
    marginTop: 8, textAlign: "center",
  },

  // ── Legacy reset button (kept for type safety) ──
  resetBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#FF6600", justifyContent: "center", alignItems: "center",
  },
  resetBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },

  // ── Coordinate inputs ──
  coordRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  coordField: { flex: 1 },
  coordLabel: { fontSize: 11, color: "#666", marginBottom: 4, fontWeight: "600" },
  coordInput: {
    borderWidth: 1.5, borderColor: "#ddd", borderRadius: 10,
    padding: 10, fontSize: 15, color: "#000", backgroundColor: "#f8f8f8",
    textAlign: "center" as const,
  },
  coordHint: { fontSize: 10, color: "#999", marginBottom: 8, textAlign: "center" as const },
});
