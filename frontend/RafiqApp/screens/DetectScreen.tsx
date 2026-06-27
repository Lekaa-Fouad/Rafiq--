/**
 * screens/DetectScreen.tsx
 *
 * Live camera object detection with face recognition.
 *
 * How it works:
 *  1. Camera captures a frame every 1.5 seconds
 *  2. Sends frame to POST /detect → gets objects (person, chair, car...)
 *  3. If a PERSON is detected:
 *     - Sends the same frame to POST /face/identify
 *     - If identified → says their name: "Ahmed ahead, 1.5 metres"
 *     - If unknown   → says "Unknown person ahead" + shows Register button
 *  4. User can tap Register → type a name → saves to database
 *  5. Next time that person appears → says their name automatically
 *
 * Speech rules:
 *  - Says each object ONCE
 *  - Says again only if distance changes by 20cm or more
 */

import * as Speech from "expo-speech";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { API_KEY, BACKEND_URL } from "../config";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetectedObject {
  object: string;
  distance: number;
  direction: string;
  is_exit: boolean;
}

interface DetectionResult {
  detections: DetectedObject[];
  exits: DetectedObject[];
  speech: string;
  processing_time_ms: number;
}

interface FaceResult {
  identified: boolean;
  name: string | null;
  confidence: number;
  face_id: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function directionIcon(dir: string) {
  if (dir === "left")  return "◀";
  if (dir === "right") return "▶";
  return "▲";
}
function directionColor(dir: string) {
  if (dir === "left")  return "#FF6600";
  if (dir === "right") return "#009900";
  return "#0066FF";
}
function distanceColor(dist: number) {
  if (dist < 1) return "#cc0000";
  if (dist < 2) return "#FF6600";
  return "#009900";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DetectScreen() {
  const [isRunning, setIsRunning]   = useState(false);
  const [result, setResult]         = useState<DetectionResult | null>(null);
  const [status, setStatus]         = useState("Tap START to open camera");
  const [frameCount, setFrameCount] = useState(0);

  // Face recognition state
  const [faceResult, setFaceResult]         = useState<FaceResult | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerName, setRegisterName]     = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const lastFrameBlobRef = useRef<Blob | null>(null); // keep last frame for registration

  // Web refs
  const videoRef    = useRef<any>(null);
  const canvasRef   = useRef<any>(null);
  const streamRef   = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  // Mobile camera ref and permissions
  const cameraRef   = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // Smart speech: key = object name, value = last spoken distance
  const prevDistRef = useRef<Record<string, number>>({});
  const DISTANCE_THRESHOLD = 0.2; // 20 cm

  // ── Start camera ───────────────────────────────────────────────────────────
  const startCamera = async () => {
    if (Platform.OS === "web") {
      try {
        const stream = await (navigator.mediaDevices as any).getUserMedia({
          video: { facingMode: "environment", width: 640, height: 480 },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setIsRunning(true);
        setStatus("Camera active — detecting...");
        intervalRef.current = setInterval(captureAndDetect, 1500);
      } catch (err: any) {
        setStatus("Camera error: " + err.message);
      }
    } else {
      if (!permission) {
        setStatus("Loading camera permissions...");
        return;
      }
      if (!permission.granted) {
        const result = await requestPermission();
        if (!result.granted) {
          setStatus("Camera permission denied.");
          Alert.alert("Permission Required", "We need camera permission to perform live object detection.");
          return;
        }
      }
      setIsRunning(true);
      setStatus("Camera active — detecting...");
      intervalRef.current = setInterval(captureAndDetect, 1500);
    }
  };

  // ── Stop camera ────────────────────────────────────────────────────────────
  const stopCamera = () => {
    clearInterval(intervalRef.current);
    if (Platform.OS === "web") {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t: any) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    prevDistRef.current = {};
    setIsRunning(false);
    setResult(null);
    setFaceResult(null);
    setStatus("Camera stopped. Tap START to resume.");
  };

  // ── Capture frame ──────────────────────────────────────────────────────────
  const captureAndDetect = async () => {
    try {
      let fileObj: any = null;

      if (Platform.OS === "web") {
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;

        const ctx = canvas.getContext("2d");
        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        fileObj = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b: Blob | null) => resolve(b), "image/jpeg", 0.8);
        });
      } else {
        if (!cameraRef.current) return;
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          skipProcessing: true,
          shutterSound: false,
        });
        if (!photo?.uri) return;
        
        fileObj = {
          uri: Platform.OS === 'android' && !photo.uri.startsWith('file:///') ? photo.uri.replace('file:/', 'file:///') : photo.uri,
          name: "frame.jpg",
          type: "image/jpeg"
        };
      }

      if (!fileObj) return;

      // ── Step 1: Object detection ──────────────────────────────────────────
      try {
        const formData = new FormData();
        if (Platform.OS === "web") {
          formData.append("image", fileObj, "frame.jpg");
        } else {
          formData.append("image", fileObj as any);
        }

        const res  = await fetch(`${BACKEND_URL}/detect`, {
          method: "POST",
          headers: { "X-API-Key": API_KEY },
          body: formData,
        });
        const json = await res.json();
        if (!json.success) return;

        const data: DetectionResult = json.data;
        setResult(data);
        setFrameCount((c) => c + 1);

        // ── Step 2: Face identification (only if person detected) ─────────
        const hasPerson = data.detections.some((d) => d.object === "person")
                       || data.exits.some((d) => d.object === "person");

        let personName: string | null = null;
        let faceData: FaceResult | null = null;

        if (hasPerson) {
          lastFrameBlobRef.current = fileObj; // save for registration
          faceData = await identifyFace(fileObj);
          setFaceResult(faceData);
          if (faceData?.identified && faceData.name) {
            personName = faceData.name;
          }
        } else {
          setFaceResult(null);
        }

        // ── Step 3: Smart speech ──────────────────────────────────────────
        const allObjects = [...data.exits, ...data.detections];
        const speechParts: string[] = [];

        for (const obj of allObjects) {
          const key      = obj.object;
          const prevDist = prevDistRef.current[key];
          const changed  = prevDist === undefined
                        || Math.abs(obj.distance - prevDist) >= DISTANCE_THRESHOLD;

          if (changed) {
            prevDistRef.current[key] = obj.distance;

            // Build the speech for this object
            let label = obj.object;

            // Replace "person" with their name if identified
            if (obj.object === "person" && personName) {
              label = personName;
            }

            const dist = _fmtDistance(obj.distance);
            const dir  = obj.direction === "center"
              ? "ahead"
              : `on your ${obj.direction}`;

            if (obj.is_exit) {
              speechParts.push(`WARNING! ${label} ${dir}, ${dist}`);
            } else {
              speechParts.push(`${label} ${dir}, ${dist}`);
            }
          }
        }

        if (speechParts.length > 0) {
          const speech = speechParts.join(". ");
          speakText(speech);
          setStatus(speech);
        } else {
          const total = allObjects.length;
          setStatus(total > 0 ? `${total} object${total !== 1 ? "s" : ""} detected` : "Nothing detected");
        }

      } catch {
        // Silently ignore network errors
      }
    } catch (e) {
      // Silently ignore capture errors
    }
  };

  // ── Identify face ──────────────────────────────────────────────────────────
  const identifyFace = async (fileData: any): Promise<FaceResult | null> => {
    try {
      const formData = new FormData();
      if (Platform.OS === "web") {
        formData.append("image", fileData, "face.jpg");
      } else {
        formData.append("image", fileData as any);
      }

      const res  = await fetch(`${BACKEND_URL}/face/identify`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY },
        body: formData,
      });
      const json = await res.json();
      if (!json.success) return null;
      return json.data as FaceResult;
    } catch {
      return null;
    }
  };

  // ── Register face ──────────────────────────────────────────────────────────
  const registerFace = async () => {
    if (!registerName.trim()) {
      Alert.alert("Name required", "Please type the person's name.");
      return;
    }
    if (!lastFrameBlobRef.current) {
      Alert.alert("No image", "No frame captured yet.");
      return;
    }

    setRegisterLoading(true);

    try {
      const formData = new FormData();
      formData.append("name", registerName.trim());
      if (Platform.OS === "web") {
        formData.append("image", lastFrameBlobRef.current as any, "face.jpg");
      } else {
        formData.append("image", lastFrameBlobRef.current as any);
      }

      const res  = await fetch(`${BACKEND_URL}/face/register`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY },
        body: formData,
      });
      const json = await res.json();

      if (!json.success) throw new Error(json.message || "Registration failed");

      // Reset speech cache so the name is announced immediately
      prevDistRef.current = {};

      setShowRegisterModal(false);
      setRegisterName("");
      speakText(`${registerName.trim()} has been registered successfully.`);
      Alert.alert("✅ Registered", `${registerName.trim()} added to the database.`);

    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
    setRegisterLoading(false);
  };

  // ── Speak ──────────────────────────────────────────────────────────────────
  const speakText = (text: string) => {
    if (Platform.OS === "web" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 1.1;
      window.speechSynthesis.speak(u);
    } else {
      Speech.stop();
      Speech.speak(text, { language: "en-US", rate: 1.1 });
    }
  };

  // ── Format distance for speech ─────────────────────────────────────────────
  const _fmtDistance = (m: number): string => {
    if (m < 0.5) return `${Math.round(m * 100)} centimetres`;
    return `${m.toFixed(1)} metres`;
  };

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t: any) => t.stop());
    };
  }, []);

  const allObjects = [...(result?.exits || []), ...(result?.detections || [])];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ── Camera view ── */}
      {Platform.OS === "web" ? (
        <View style={styles.cameraContainer}>
          {React.createElement("video", { ref: videoRef, style: styles.video as any, autoPlay: true, playsInline: true, muted: true })}
          {React.createElement("canvas", { ref: canvasRef, style: { display: "none" } })}

          {/* Object overlay tags */}
          {isRunning && allObjects.length > 0 && (
            <View style={styles.overlay}>
              {allObjects.slice(0, 5).map((obj, i) => {
                const label = obj.object === "person" && faceResult?.identified && faceResult.name
                  ? faceResult.name
                  : obj.object;
                return (
                  <View key={i} style={[styles.overlayTag, { borderColor: obj.is_exit ? "#cc0000" : directionColor(obj.direction) }]}>
                    <Text style={styles.overlayTagText}>{obj.is_exit ? "⚠️ " : ""}{label}</Text>
                    <Text style={styles.overlayTagMeta}>{directionIcon(obj.direction)} {obj.distance.toFixed(1)}m</Text>
                  </View>
                );
              })}
            </View>
          )}

          {!isRunning && (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraPlaceholderIcon}>📷</Text>
              <Text style={styles.cameraPlaceholderText}>Camera off</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.cameraContainer}>
          {isRunning ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              ref={cameraRef}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraPlaceholderIcon}>📷</Text>
              <Text style={styles.cameraPlaceholderText}>Camera off</Text>
            </View>
          )}

          {/* Object overlay tags */}
          {isRunning && allObjects.length > 0 && (
            <View style={styles.overlay}>
              {allObjects.slice(0, 5).map((obj, i) => {
                const label = obj.object === "person" && faceResult?.identified && faceResult.name
                  ? faceResult.name
                  : obj.object;
                return (
                  <View key={i} style={[styles.overlayTag, { borderColor: obj.is_exit ? "#cc0000" : directionColor(obj.direction) }]}>
                    <Text style={styles.overlayTagText}>{obj.is_exit ? "⚠️ " : ""}{label}</Text>
                    <Text style={styles.overlayTagMeta}>{directionIcon(obj.direction)} {obj.distance.toFixed(1)}m</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* ── Controls ── */}
      <View style={styles.controls}>
        <Text style={styles.statusText} numberOfLines={2}>{status}</Text>
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={[styles.startBtn, isRunning && styles.stopBtn]}
            onPress={isRunning ? stopCamera : startCamera}
          >
            <Text style={styles.startBtnText}>
              {isRunning ? "⏹  STOP" : "▶  START CAMERA"}
            </Text>
          </TouchableOpacity>

          {/* Register button — shown when unknown person detected */}
          {isRunning && faceResult && !faceResult.identified && (
            <TouchableOpacity
              style={styles.registerBtn}
              onPress={() => setShowRegisterModal(true)}
            >
              <Text style={styles.registerBtnText}>👤 Register Person</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Face recognition banner ── */}
      {faceResult && (
        <View style={[
          styles.faceBanner,
          faceResult.identified ? styles.faceBannerKnown : styles.faceBannerUnknown,
        ]}>
          {faceResult.identified ? (
            <Text style={styles.faceBannerText}>
              👤 <Text style={{ fontWeight: "700" }}>{faceResult.name}</Text>
              {"  "}
              <Text style={styles.faceBannerConf}>
                {(faceResult.confidence * 100).toFixed(0)}% match
              </Text>
            </Text>
          ) : (
            <Text style={styles.faceBannerText}>
              👤 Unknown person — tap <Text style={{ fontWeight: "700" }}>"Register Person"</Text> to add them
            </Text>
          )}
        </View>
      )}

      {/* ── Detection results list ── */}
      {allObjects.length > 0 && (
        <ScrollView style={styles.results} showsVerticalScrollIndicator={false}>
          {allObjects.map((obj, i) => {
            const label = obj.object === "person" && faceResult?.identified && faceResult.name
              ? faceResult.name
              : obj.object;
            return (
              <View key={i} style={[styles.objectCard, obj.is_exit && styles.objectCardExit]}>
                <View style={[styles.dirBox, { backgroundColor: directionColor(obj.direction) }]}>
                  <Text style={styles.dirIcon}>{directionIcon(obj.direction)}</Text>
                  <Text style={styles.dirLabel}>{obj.direction.toUpperCase()}</Text>
                </View>
                <View style={styles.objectInfo}>
                  <Text style={styles.objectName}>{obj.is_exit ? "⚠️ " : ""}{label}</Text>
                  {obj.is_exit && <Text style={styles.exitWarning}>EXIT / DOOR — PRIORITY</Text>}
                </View>
                <View style={[styles.distBox, { backgroundColor: distanceColor(obj.distance) }]}>
                  <Text style={styles.distValue}>{obj.distance.toFixed(1)}</Text>
                  <Text style={styles.distUnit}>m</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {isRunning && allObjects.length === 0 && (
        <View style={styles.emptyState}>
          <ActivityIndicator color="#0066FF" size="large" />
          <Text style={styles.emptyText}>Scanning...</Text>
        </View>
      )}

      {/* ── Register Person Modal ── */}
      <Modal
        visible={showRegisterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRegisterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>👤 Register Person</Text>
            <Text style={styles.modalSub}>
              Type the name of this person to add them to the database.
              Next time they appear, the app will say their name.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Enter name, e.g. Ahmed"
              placeholderTextColor="#999"
              value={registerName}
              onChangeText={setRegisterName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={registerFace}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowRegisterModal(false); setRegisterName(""); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, registerLoading && styles.modalSaveBtnDisabled]}
                onPress={registerFace}
                disabled={registerLoading}
              >
                {registerLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Save to Database</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },

  cameraContainer: { height: 260, backgroundColor: "#111", position: "relative", overflow: "hidden" },
  video: { width: "100%", height: "100%", objectFit: "cover" } as any,
  cameraPlaceholder: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "center", alignItems: "center", backgroundColor: "#111",
  },
  cameraPlaceholderIcon: { fontSize: 48, marginBottom: 8 },
  cameraPlaceholderText: { color: "#555", fontSize: 14 },

  overlay: { position: "absolute", top: 8, left: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  overlayTag: {
    backgroundColor: "rgba(0,0,0,0.75)", borderWidth: 1.5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  overlayTagText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  overlayTagMeta: { color: "#ccc", fontSize: 10 },

  mobilePlaceholder: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#111" },
  mobilePlaceholderIcon:  { fontSize: 64, marginBottom: 16 },
  mobilePlaceholderTitle: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 12 },
  mobilePlaceholderText:  { fontSize: 14, color: "#888", textAlign: "center", lineHeight: 22 },

  controls: { backgroundColor: "#1a1a1a", padding: 12, borderTopWidth: 1, borderTopColor: "#333" },
  statusText: { color: "#aaa", fontSize: 13, marginBottom: 8, minHeight: 18 },
  controlRow: { flexDirection: "row", gap: 8 },

  startBtn: { flex: 1, backgroundColor: "#0066FF", borderRadius: 12, padding: 14, alignItems: "center" },
  stopBtn:  { backgroundColor: "#cc0000" },
  startBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  registerBtn: {
    backgroundColor: "#FF6600", borderRadius: 12,
    padding: 14, alignItems: "center", justifyContent: "center",
  },
  registerBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Face banner
  faceBanner: { padding: 10, paddingHorizontal: 14 },
  faceBannerKnown:   { backgroundColor: "#0d2a0d" },
  faceBannerUnknown: { backgroundColor: "#2a1a0d" },
  faceBannerText:    { color: "#fff", fontSize: 13 },
  faceBannerConf:    { color: "#88cc88", fontSize: 12 },

  results: { flex: 1, backgroundColor: "#111", paddingHorizontal: 12, paddingTop: 8 },

  objectCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1e1e1e", borderRadius: 12, marginBottom: 8, overflow: "hidden",
  },
  objectCardExit: { borderWidth: 1.5, borderColor: "#cc0000" },

  dirBox: { width: 60, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  dirIcon:  { fontSize: 18, color: "#fff" },
  dirLabel: { fontSize: 9, color: "#fff", fontWeight: "700", marginTop: 2 },

  objectInfo: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  objectName: { fontSize: 16, fontWeight: "700", color: "#fff", textTransform: "capitalize" },
  exitWarning: { fontSize: 10, color: "#ff6666", fontWeight: "600", marginTop: 2 },

  distBox: { width: 60, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  distValue: { fontSize: 18, fontWeight: "700", color: "#fff" },
  distUnit:  { fontSize: 10, color: "#fff", marginTop: 1 },

  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#111", gap: 12 },
  emptyText:  { color: "#555", fontSize: 14 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: "#1e1e1e", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 8 },
  modalSub:   { fontSize: 13, color: "#aaa", marginBottom: 20, lineHeight: 20 },
  modalInput: {
    borderWidth: 1.5, borderColor: "#444", borderRadius: 12,
    padding: 14, fontSize: 16, color: "#fff", backgroundColor: "#2a2a2a",
    marginBottom: 16,
  },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalCancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: "#555",
    borderRadius: 12, padding: 14, alignItems: "center",
  },
  modalCancelText: { color: "#aaa", fontSize: 15, fontWeight: "600" },
  modalSaveBtn: {
    flex: 2, backgroundColor: "#0066FF",
    borderRadius: 12, padding: 14, alignItems: "center",
  },
  modalSaveBtnDisabled: { backgroundColor: "#334" },
  modalSaveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
