/**
 * controllers/useVoiceRecorder.ts
 *
 * Reusable hook: mic recording on web (MediaRecorder) and mobile (expo-av).
 * Calls onAudioReady(blob, filename) when recording stops.
 * Always resets state to "idle" when onAudioReady finishes — even on error.
 */

import { useRef, useState } from "react";
import { Alert, Platform } from "react-native";

export type RecorderState = "idle" | "recording" | "processing";

interface UseVoiceRecorderOptions {
  onAudioReady: (blob: Blob, filename: string) => Promise<void>;
}

export function useVoiceRecorder({ onAudioReady }: UseVoiceRecorderOptions) {
  const [state, setState] = useState<RecorderState>("idle");

  // Keep a ref to onAudioReady so stale closures never cause issues
  const callbackRef = useRef(onAudioReady);
  callbackRef.current = onAudioReady;

  // Web refs
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef   = useRef<any[]>([]);

  // Mobile ref
  const recordingRef = useRef<any>(null);

  const isRecording = state === "recording";

  // ── Run the callback, always reset to idle ────────────────────────────────
  const runCallback = async (blob: Blob, filename: string) => {
    setState("processing");
    try {
      await callbackRef.current(blob, filename);
    } catch {
      // errors are handled inside onAudioReady — just ensure idle reset
    } finally {
      setState("idle");
    }
  };

  // ── Start ─────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    if (Platform.OS === "web") {
      try {
        const stream = await (navigator.mediaDevices as any).getUserMedia({ audio: true });
        audioChunksRef.current = [];

        const recorder = new (window as any).MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e: any) => {
          if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          stream.getTracks().forEach((t: any) => t.stop());
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          runCallback(blob, "recording.webm");
        };

        recorder.start();
        setState("recording");
      } catch {
        Alert.alert(
          "Microphone blocked",
          "Please allow microphone access in your browser and try again.",
        );
      }
    } else {
      try {
        const { Audio } = require("expo-av");
        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        recordingRef.current = recording;
        setState("recording");
      } catch (err: any) {
        Alert.alert("Microphone Error", err.message || "Could not start recording.");
      }
    }
  };

  // ── Stop ──────────────────────────────────────────────────────────────────
  const stopRecording = async () => {
    if (Platform.OS === "web") {
      // onstop handler takes over from here
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
    } else {
      const recording = recordingRef.current;
      if (!recording) { setState("idle"); return; }
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        recordingRef.current = null;
        if (!uri) throw new Error("No recording URI returned.");

        let fileObj: any;
        if (Platform.OS === 'web') {
          const response = await fetch(uri);
          fileObj = await response.blob();
        } else {
          fileObj = {
            uri: Platform.OS === 'android' && !uri.startsWith('file:///') ? uri.replace('file:/', 'file:///') : uri,
            name: "recording.m4a",
            type: "audio/m4a"
          };
        }
        await runCallback(fileObj, "recording.m4a");
      } catch (err: any) {
        Alert.alert("Recording error", err.message || "Could not stop recording.");
        setState("idle");
      }
    }
  };

  const toggle = () => (isRecording ? stopRecording() : startRecording());

  return { state, isRecording, toggle, startRecording, stopRecording };
}
