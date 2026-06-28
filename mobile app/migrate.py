import os

frontend_file = r"c:\Rafiq--\frontend\RafiqApp\screens\IndoorScreen.tsx"
mobile_file = r"c:\Rafiq--\mobile app\app\(tabs)\navigate.tsx"

with open(frontend_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
content = content.replace('import * as Speech from "expo-speech";', 'import { useVoice } from "../../src/contexts/VoiceContext";')
content = content.replace('import { API_KEY, BACKEND_URL } from "../config";', 'import { API_URL as BACKEND_URL, API_KEY } from "../../src/api/client";')
content = content.replace('import localFloorPlans from "../data/floorPlans.json";', 'import localFloorPlans from "../../src/data/floorPlans.json";')
content = content.replace('import { useVoiceRecorder } from "../controllers/useVoiceRecorder";', 'import { useVoiceRecorder } from "../../src/hooks/useVoiceRecorder";')

# 2. Component Name
content = content.replace('export default function IndoorScreen() {', 'export default function NavigateScreen() {')

# 3. Add useVoice() hook call
content = content.replace('const screenWidth = Dimensions.get("window").width;', 'const { speak: voiceSpeak } = useVoice();\n  const screenWidth = Dimensions.get("window").width;')

# 4. Replace speak implementation
speak_old = """  const speak = (text: string) => {
    if (Platform.OS === "web" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    } else {
      Speech.stop();
      Speech.speak(text, { language: "en-US" });
    }
  };"""

speak_new = """  const speak = (text: string) => {
    voiceSpeak(text, { instant: true });
  };"""
content = content.replace(speak_old, speak_new)

# 5. Rewrite useVoiceRecorder logic
recorder_start = 'const { state: recorderState, isRecording, toggle: toggleMic } = useVoiceRecorder({'
recorder_end_str = '  });'

if recorder_start in content:
    start_idx = content.find(recorder_start)
    # find the matching '  });' for this block.
    # We know it ends before `useEffect(() => { loadFloorPlans`
    end_idx = content.find('  // ── Load floor plans ───────────────────────────────────────────────────────', start_idx)
    # Extract the original block
    original_block = content[start_idx:end_idx]
    
    new_block = """const { recordingState: recorderState, isRecording, startRecording, stopRecording } = useVoiceRecorder();

  const toggleMic = async () => {
    if (isRecording) {
      const uri = await stopRecording();
      if (uri) {
        await handleAudioReady(uri);
      }
    } else {
      await startRecording();
    }
  };

  const handleAudioReady = async (uri: string) => {
      const currentPlan = selectedRef.current;
      if (!currentPlan) {
        setVoiceStatus("⚠️ Please select a floor plan first.");
        return;
      }
      setVoiceStatus("🔄 Transcribing your voice...");

      try {
        const sttRes = await tryUrls("/voice/stt", () => {
          const form = new FormData();
          form.append("audio", {
            uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
            name: 'audio.m4a',
            type: 'audio/m4a'
          } as any);
          return {
            method: "POST",
            headers: { "X-API-Key": API_KEY },
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

        setVoiceStatus(`🎤 Heard: "${transcript}"`);
        setQueryText(transcript);

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
          `${msg}\\n\\nTip: say clearly — "I am in room one and I want to go to room three"`,
        );
      } finally {
        setLoading(false);
      }
  };
"""
    content = content.replace(original_block, new_block + "\n")

with open(mobile_file, "w", encoding="utf-8") as f:
    f.write(content)

print("Migration script executed successfully.")
