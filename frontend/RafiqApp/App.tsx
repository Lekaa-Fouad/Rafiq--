/**
 * App.tsx — Rafiq main entry point
 *
 * App with simple bottom tab navigation and a Global Voice Assistant.
 */

import React, { useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, View, TouchableOpacity, Text, Alert, ActivityIndicator, Platform } from "react-native";
import * as Speech from "expo-speech";

import IndoorScreen from "./screens/IndoorScreen";
import DetectScreen from "./screens/DetectScreen";
import OCRScreen from "./screens/OCRScreen";
import VoiceScreen from "./screens/VoiceScreen";

import { useVoiceRecorder } from "./controllers/useVoiceRecorder";
import { API_KEY, BACKEND_URL } from "./config";

// ── Fallback Backend URLs (same as IndoorScreen) ─────────────────────────────
const BACKEND_URLS = [
  BACKEND_URL,
  "http://192.168.100.8:8000",
  "http://10.0.2.2:8000",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

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
      if (res.status === 401 || res.status === 422) return res;
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError || new Error("Unable to reach backend");
};

// ── Intent Mapping ───────────────────────────────────────────────────────────
// UPDATE THESE VALUES to exactly match your Dialogflow Intent Names!
const INTENT_MAP: Record<string, string> = {
  "NAVIGATE_INTENT": "Indoor", // Change "NAVIGATE_INTENT" to your exact Dialogflow intent name
  "DETECT_INTENT": "Detect",
  "OCR_INTENT": "OCR",
  "CHAT_INTENT": "Voice",
};

export default function App() {
  const [activeTab, setActiveTab] = useState("Indoor");
  const [globalVoiceStatus, setGlobalVoiceStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const { state: recorderState, isRecording, toggle: toggleMic } = useVoiceRecorder({
    onAudioReady: async (blob, filename) => {
      setIsProcessing(true);
      setGlobalVoiceStatus("Transcribing...");
      
      try {
        // Step 1: STT
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
            body: form,
          };
        });

        const sttText = await sttRes.text();
        const sttJson = JSON.parse(sttText);
        if (!sttJson.success) throw new Error(sttJson.message || "STT failed");

        const transcript: string = sttJson.data?.transcript ?? "";
        if (!transcript.trim()) {
          setGlobalVoiceStatus("No speech detected.");
          setTimeout(() => setGlobalVoiceStatus(""), 3000);
          setIsProcessing(false);
          return;
        }

        setGlobalVoiceStatus(`Heard: "${transcript}"\nUnderstanding...`);

        // Step 2: NLP Intent Extraction
        const nlpRes = await tryUrls("/nlp/", () => ({
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
          body: JSON.stringify({ text: transcript }),
        }));
        
        const nlpText = await nlpRes.text();
        const nlpJson = JSON.parse(nlpText);

        const intentName = nlpJson.intent; // e.g. "NAVIGATE_INTENT"
        const parameters = nlpJson.parameters;

        console.log("NLP Intent detected:", intentName, parameters);

        // Map the intent to a tab screen
        const targetTab = INTENT_MAP[intentName];

        if (targetTab) {
          setGlobalVoiceStatus(`Opening ${targetTab}...`);
          setActiveTab(targetTab);
          
          if (nlpJson.fulfillment_text) {
             Speech.speak(nlpJson.fulfillment_text, { language: "ar-SA" }); 
          } else {
             Speech.speak(`Opening ${targetTab}`, { language: "en-US" });
          }
        } else {
          setGlobalVoiceStatus(`Unknown Intent: ${intentName}`);
          Alert.alert("Unknown Intent", `Dialogflow understood intent as: "${intentName}". Make sure to add this exact name to INTENT_MAP in App.tsx!`);
        }

        setTimeout(() => setGlobalVoiceStatus(""), 5000);

      } catch (err: any) {
         setGlobalVoiceStatus(`Error: ${err.message}`);
         setTimeout(() => setGlobalVoiceStatus(""), 5000);
      } finally {
         setIsProcessing(false);
      }
    }
  });

  const renderScreen = () => {
    switch (activeTab) {
      case "Indoor": return <IndoorScreen />;
      case "Detect": return <DetectScreen />;
      case "OCR": return <OCRScreen />;
      case "Voice": return <VoiceScreen />;
      default: return <IndoorScreen />;
    }
  };

  const tabs = ["Indoor", "Detect", "OCR", "Voice"];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {globalVoiceStatus ? (
         <View style={styles.globalStatusContainer}>
            <Text style={styles.globalStatusText}>{globalVoiceStatus}</Text>
         </View>
      ) : null}

      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>

      {/* Global Mic Button */}
      <View style={styles.globalMicContainer}>
        <TouchableOpacity 
          style={[styles.globalMicButton, isRecording && styles.recordingMic]} 
          onPress={toggleMic}
          disabled={isProcessing}
        >
          {isProcessing ? (
             <ActivityIndicator color="#fff" />
          ) : (
             <Text style={styles.micIcon}>{isRecording ? "⏹" : "🎤"}</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity 
            key={tab} 
            style={styles.tabButton}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  screenContainer: {
    flex: 1,
  },
  globalStatusContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 10,
    borderRadius: 8,
    zIndex: 100,
    alignItems: 'center',
  },
  globalStatusText: {
    color: '#fff',
    textAlign: 'center',
  },
  globalMicContainer: {
    position: 'absolute',
    bottom: 70,
    alignSelf: 'center',
    zIndex: 100,
  },
  globalMicButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  recordingMic: {
    backgroundColor: '#cc0000',
  },
  micIcon: {
    fontSize: 24,
    color: '#fff',
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#e0e0e0",
    backgroundColor: "#f8f8f8",
    paddingBottom: 5,
    paddingTop: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
  },
  tabText: {
    fontSize: 12,
    color: "#888",
  },
  activeTabText: {
    color: "#007AFF",
    fontWeight: "bold",
  },
});
