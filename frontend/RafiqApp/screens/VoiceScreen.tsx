/**
 * screens/VoiceScreen.tsx
 *
 * Works on BOTH web and mobile.
 *
 * STT (Speech → Text):
 *   Web:    MediaRecorder API → webm blob → POST /voice/stt
 *   Mobile: expo-av Audio.Recording → m4a file → POST /voice/stt
 *
 * TTS (Text → Speech):
 *   Web:    POST /voice/tts → MP3 blob → Audio element
 *   Mobile: expo-speech (instant, no backend needed)
 */

import * as Speech from "expo-speech";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { API_KEY, BACKEND_URL } from "../config";

export default function VoiceScreen() {
  const [transcript, setTranscript] = useState("");
  const [sttLoading, setSttLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sttStatus, setSttStatus] = useState("Tap the mic to start recording");

  const [ttsText, setTtsText] = useState("");
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsStatus, setTtsStatus] = useState("Type text and tap Speak");

  // Web recording refs
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<any[]>([]);
  const fileInputRef = useRef<any>(null);

  // Mobile recording ref
  const recordingRef = useRef<any>(null);

  // ── Toggle mic ─────────────────────────────────────────────────────────────
  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = async () => {
    if (Platform.OS === "web") {
      // Web: use MediaRecorder
      try {
        const stream = await (navigator.mediaDevices as any).getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const recorder = new (window as any).MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e: any) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t: any) => t.stop());
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          await transcribeAudio(blob, "recording.webm");
        };

        recorder.start();
        setIsRecording(true);
        setSttStatus("🔴 Recording... tap again to stop");
      } catch {
        Alert.alert("Microphone", "Please allow microphone access in your browser.");
      }
    } else {
      // Mobile: use expo-av
      try {
        const { Audio } = require("expo-av");

        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        setIsRecording(true);
        setSttStatus("🔴 Recording... tap again to stop");
      } catch (err: any) {
        Alert.alert("Microphone Error", err.message);
      }
    }
  };

  // ── Stop recording ─────────────────────────────────────────────────────────
  const stopRecording = async () => {
    setIsRecording(false);
    setSttStatus("Processing...");

    if (Platform.OS === "web") {
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
    } else {
      // Mobile: stop expo-av recording
      try {
        const recording = recordingRef.current;
        if (!recording) return;

        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        recordingRef.current = null;

        if (!uri) throw new Error("No recording URI");

        // Fetch the file as a blob and send to backend
        const response = await fetch(uri);
        const blob = await response.blob();
        await transcribeAudio(blob, "recording.m4a");
      } catch (err: any) {
        setSttStatus("Error: " + err.message);
      }
    }
  };

  // ── Send audio to backend STT ──────────────────────────────────────────────
  const transcribeAudio = async (audioBlob: Blob, filename: string) => {
    setSttLoading(true);
    setSttStatus("Transcribing with Whisper AI...");
    setTranscript("");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, filename);

      const res = await fetch(`${BACKEND_URL}/voice/stt`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY },
        body: formData,
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.message || "STT failed");

      const data = json.data;
      setTranscript(data.transcript);
      setSttStatus(
        `✅ ${data.language.toUpperCase()} · ${(data.confidence * 100).toFixed(0)}% · ${data.duration_seconds.toFixed(1)}s`
      );
      if (data.transcript) setTtsText(data.transcript);
    } catch (err: any) {
      setSttStatus("Error: " + err.message);
    }
    setSttLoading(false);
  };

  // ── TTS ────────────────────────────────────────────────────────────────────
  const speakText = async () => {
    if (!ttsText.trim()) {
      Alert.alert("Empty", "Please type some text to speak.");
      return;
    }

    setTtsLoading(true);
    setTtsStatus("Speaking...");

    try {
      if (Platform.OS !== "web") {
        // Mobile: expo-speech (instant, no backend needed)
        Speech.stop();
        Speech.speak(ttsText, {
          language: "en-US",
          onDone: () => setTtsStatus("Type text and tap Speak"),
        });
        setTtsStatus("✅ Speaking...");
        setTtsLoading(false);
        return;
      }

      // Web: call backend TTS → get MP3 → play
      const formData = new FormData();
      formData.append("text", ttsText);

      const res = await fetch(`${BACKEND_URL}/voice/tts`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY },
        body: formData,
      });

      if (!res.ok) throw new Error(`TTS failed: ${res.status}`);

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
      setTtsStatus("✅ Playing...");
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setTtsStatus("Type text and tap Speak");
      };
    } catch (err: any) {
      // Fallback to browser TTS on web
      if (Platform.OS === "web" && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(ttsText);
        u.lang = "en-US";
        window.speechSynthesis.speak(u);
        setTtsStatus("✅ Speaking...");
      } else {
        setTtsStatus("Error: " + err.message);
      }
    }
    setTtsLoading(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── STT Section ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎤 Speech → Text</Text>
        <Text style={styles.sectionSub}>
          Record your voice and convert it to text using Whisper AI
        </Text>

        <Text style={styles.sectionStatus}>{sttStatus}</Text>

        {/* Big mic button */}
        <TouchableOpacity
          style={[
            styles.micBtn,
            isRecording && styles.micBtnRecording,
            sttLoading && styles.micBtnDisabled,
          ]}
          onPress={toggleRecording}
          disabled={sttLoading}
        >
          {sttLoading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Text style={styles.micBtnIcon}>{isRecording ? "⏹" : "🎤"}</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.micHint}>
          {isRecording ? "Tap to stop recording" : "Tap to start recording"}
        </Text>

        {/* Web: upload audio file */}
        {Platform.OS === "web" && (
          <>
            <Text style={styles.orText}>— or upload an audio file —</Text>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => fileInputRef.current?.click()}
              disabled={sttLoading}
            >
              <Text style={styles.uploadBtnText}>📁  Upload Audio File</Text>
            </TouchableOpacity>
            {/* @ts-ignore */}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={(e: any) => {
                const file = e.target.files?.[0];
                if (file) transcribeAudio(file, file.name);
              }}
            />
          </>
        )}

        {/* Transcript result */}
        {transcript ? (
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptLabel}>Transcript:</Text>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.divider} />

      {/* ── TTS Section ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔊 Text → Speech</Text>
        <Text style={styles.sectionSub}>Type any text and hear it spoken aloud</Text>

        <Text style={styles.sectionStatus}>{ttsStatus}</Text>

        <TextInput
          style={styles.ttsInput}
          placeholder="Type text here to speak..."
          placeholderTextColor="#999"
          value={ttsText}
          onChangeText={setTtsText}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity
          style={[styles.speakBtn, ttsLoading && styles.speakBtnDisabled]}
          onPress={speakText}
          disabled={ttsLoading}
        >
          {ttsLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.speakBtnText}>🔊  Speak</Text>
          )}
        </TouchableOpacity>

        {/* Quick phrases */}
        <Text style={styles.quickTitle}>Quick phrases:</Text>
        <View style={styles.quickRow}>
          {["Hello", "Turn left", "Turn right", "You have arrived", "مرحبا", "اتجه يساراً"].map(
            (phrase) => (
              <TouchableOpacity
                key={phrase}
                style={styles.quickChip}
                onPress={() => setTtsText(phrase)}
              >
                <Text style={styles.quickChipText}>{phrase}</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9ff" },

  section: {
    backgroundColor: "#fff",
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#003399", marginBottom: 4 },
  sectionSub: { fontSize: 13, color: "#666", marginBottom: 12 },
  sectionStatus: {
    fontSize: 13,
    color: "#555",
    fontStyle: "italic",
    textAlign: "center",
    marginBottom: 16,
    minHeight: 18,
  },

  micBtn: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#0066FF",
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    shadowColor: "#0066FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  micBtnRecording: { backgroundColor: "#cc0000" },
  micBtnDisabled: { backgroundColor: "#aaa" },
  micBtnIcon: { fontSize: 36 },
  micHint: { textAlign: "center", fontSize: 12, color: "#888", marginBottom: 12 },

  orText: { textAlign: "center", color: "#aaa", fontSize: 12, marginVertical: 8 },
  uploadBtn: {
    borderWidth: 1.5,
    borderColor: "#0066FF",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  uploadBtnText: { color: "#0066FF", fontSize: 14, fontWeight: "600" },

  transcriptBox: {
    backgroundColor: "#f0f6ff",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  transcriptLabel: { fontSize: 12, fontWeight: "700", color: "#003399", marginBottom: 4 },
  transcriptText: { fontSize: 15, color: "#111", lineHeight: 22 },

  divider: { height: 1, backgroundColor: "#eee", marginHorizontal: 16 },

  ttsInput: {
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: "#000",
    backgroundColor: "#f8f8f8",
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  speakBtn: {
    backgroundColor: "#0066FF",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  speakBtnDisabled: { backgroundColor: "#99bbff" },
  speakBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  quickTitle: { fontSize: 12, color: "#888", marginBottom: 8 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: {
    backgroundColor: "#e8f0ff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  quickChipText: { color: "#0066FF", fontSize: 13, fontWeight: "600" },
});
