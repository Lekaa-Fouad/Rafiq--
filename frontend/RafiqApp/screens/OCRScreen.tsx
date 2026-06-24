/**
 * screens/OCRScreen.tsx
 *
 * OCR screen — upload an image, extract text from it.
 * Calls POST /ocr on the Rafiq backend.
 */

import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Speech from "expo-speech";
import { CameraView, useCameraPermissions } from "expo-camera";
import { API_KEY, BACKEND_URL } from "../config";

interface BoundingBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
}

interface OCRResult {
  text: string;
  language: string;
  confidence: number;
  bounding_boxes: BoundingBox[];
  speech: string;
  processing_time_ms: number;
}

export default function OCRScreen() {
  const [result, setResult]   = useState<OCRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState("Upload an image to read text from it");
  const fileInputRef = useRef<any>(null);

  // Mobile camera state & permissions
  const [isCameraActive, setIsCameraActive] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const pickAndOCR = async (file: File) => {
    setLoading(true);
    setResult(null);
    setStatus("Reading text from image...");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`${BACKEND_URL}/ocr`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY },
        body: formData,
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.message || "OCR failed");

      setResult(json.data);
      setStatus(json.data.speech);

      // Speak result
      if (Platform.OS === "web" && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(json.data.speech);
        u.lang = "en-US";
        window.speechSynthesis.speak(u);
      }
    } catch (err: any) {
      setStatus("Error: " + err.message);
      Alert.alert("Error", err.message);
    }
    setLoading(false);
  };

  const handleWebFileChange = (e: any) => {
    const file = e.target.files?.[0];
    if (file) pickAndOCR(file);
  };

  const handleCaptureAndOCR = async () => {
    if (!cameraRef.current) return;
    setLoading(true);
    setResult(null);
    setStatus("Capturing and reading text...");

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });
      if (!photo?.uri) throw new Error("Could not capture image");

      // Close camera view immediately
      setIsCameraActive(false);

      const response = await fetch(photo.uri);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append("image", blob, "ocr.jpg");

      const res = await fetch(`${BACKEND_URL}/ocr`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY },
        body: formData,
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.message || "OCR failed");

      setResult(json.data);
      setStatus(json.data.speech);

      // Speak OCR result natively on mobile
      Speech.stop();
      Speech.speak(json.data.speech, { language: "en-US" });

    } catch (err: any) {
      setStatus("Error: " + err.message);
      Alert.alert("Error", err.message);
    }
    setLoading(false);
  };

  const handlePickImage = async () => {
    if (Platform.OS === "web") {
      fileInputRef.current?.click();
    } else {
      if (!permission) {
        setStatus("Loading camera permissions...");
        return;
      }
      if (!permission.granted) {
        const result = await requestPermission();
        if (!result.granted) {
          Alert.alert("Permission Required", "We need camera permission to take a picture of text.");
          return;
        }
      }
      setIsCameraActive(true);
    }
  };

  const getLangLabel = (lang: string) => {
    if (lang === "ar")    return "🇸🇦 Arabic";
    if (lang === "en")    return "🇬🇧 English";
    if (lang === "en+ar") return "🌐 English + Arabic";
    return lang;
  };

  if (isCameraActive && Platform.OS !== "web") {
    return (
      <View style={styles.cameraContainerFull}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          ref={cameraRef}
        />
        
        {/* Top Header Overlay */}
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraHeaderTitle}>Scan Text</Text>
          <Text style={styles.cameraHeaderSub}>Point at text to read it aloud</Text>
        </View>

        {/* Bottom controls */}
        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setIsCameraActive(false)}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.captureBtn}
            onPress={handleCaptureAndOCR}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0066FF" />
            ) : (
              <View style={styles.captureBtnInner} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📝 Text Reader (OCR)</Text>
        <Text style={styles.headerSub}>Upload a photo of a sign, label, or document</Text>
      </View>

      {/* Status */}
      <Text style={styles.status} numberOfLines={3}>{status}</Text>

      {/* Upload button */}
      <TouchableOpacity
        style={[styles.uploadBtn, loading && styles.uploadBtnDisabled]}
        onPress={handlePickImage}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.uploadBtnText}>📷  Choose Image</Text>
        )}
      </TouchableOpacity>

      {/* Hidden file input for web */}
      {Platform.OS === "web" && (
        // @ts-ignore
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleWebFileChange}
        />
      )}

      {/* Results */}
      {result && (
        <ScrollView style={styles.results} showsVerticalScrollIndicator={false}>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{result.bounding_boxes.length}</Text>
              <Text style={styles.statLabel}>regions</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{(result.confidence * 100).toFixed(0)}%</Text>
              <Text style={styles.statLabel}>confidence</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{getLangLabel(result.language)}</Text>
              <Text style={styles.statLabel}>language</Text>
            </View>
          </View>

          {/* Full extracted text */}
          {result.text ? (
            <View style={styles.textBox}>
              <Text style={styles.textBoxTitle}>Extracted Text</Text>
              <Text style={styles.extractedText}>{result.text}</Text>
            </View>
          ) : (
            <View style={styles.textBox}>
              <Text style={styles.noText}>No text found in this image.</Text>
            </View>
          )}

          {/* Per-region breakdown */}
          {result.bounding_boxes.length > 0 && (
            <View style={styles.regionsBox}>
              <Text style={styles.regionsTitle}>
                Text Regions ({result.bounding_boxes.length})
              </Text>
              {result.bounding_boxes.map((bb, i) => (
                <View key={i} style={styles.regionRow}>
                  <View style={styles.regionNum}>
                    <Text style={styles.regionNumText}>{i + 1}</Text>
                  </View>
                  <View style={styles.regionContent}>
                    <Text style={styles.regionText}>{bb.text}</Text>
                    <Text style={styles.regionMeta}>
                      {(bb.confidence * 100).toFixed(0)}% · {bb.w}×{bb.h}px
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9ff", padding: 16 },

  header: { marginBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#003399" },
  headerSub: { fontSize: 13, color: "#666", marginTop: 2 },

  status: {
    fontSize: 13,
    color: "#555",
    fontStyle: "italic",
    textAlign: "center",
    marginBottom: 14,
    minHeight: 18,
  },

  uploadBtn: {
    backgroundColor: "#0066FF",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  uploadBtnDisabled: { backgroundColor: "#99bbff" },
  uploadBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  results: { flex: 1 },

  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#e8f0ff",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  statValue: { fontSize: 16, fontWeight: "700", color: "#003399" },
  statLabel: { fontSize: 11, color: "#666", marginTop: 2 },

  textBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  textBoxTitle: { fontSize: 13, fontWeight: "700", color: "#333", marginBottom: 8 },
  extractedText: { fontSize: 15, color: "#111", lineHeight: 22 },
  noText: { fontSize: 14, color: "#888", fontStyle: "italic", textAlign: "center" },

  regionsBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  regionsTitle: { fontSize: 13, fontWeight: "700", color: "#333", marginBottom: 10 },
  regionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  regionNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#0066FF",
    justifyContent: "center", alignItems: "center",
  },
  regionNumText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  regionContent: { flex: 1 },
  regionText: { fontSize: 13, color: "#222" },
  regionMeta: { fontSize: 11, color: "#888", marginTop: 2 },

  // Full screen Mobile Camera Scanner Styles
  cameraContainerFull: {
    flex: 1,
    backgroundColor: "#000",
  },
  cameraHeader: {
    position: "absolute",
    top: 40,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  cameraHeaderTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  cameraHeaderSub: {
    color: "#ccc",
    fontSize: 12,
    marginTop: 4,
  },
  cameraControls: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  cancelBtn: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  cancelBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  captureBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  captureBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "#000",
    backgroundColor: "#fff",
  },
});
