/**
 * src/contexts/VoiceContext.tsx
 * Voice-first interaction provider — the central nervous system of Rafiq's audio layer.
 *
 * Manages:
 *   - State machine: idle → listening → processing → speaking → idle
 *   - Recording via expo-av Audio.Recording
 *   - Transcription via backend STT (voiceService.transcribeAudio)
 *   - Two TTS modes:
 *       • instant=true  → expo-speech (device TTS, ~0ms latency, for short confirmations)
 *       • instant=false → voiceService.synthesizeSpeech → expo-av Sound (high-quality backend TTS)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { transcribeAudio, synthesizeSpeech } from '../services/voiceService';

// ─── Public Types ────────────────────────────────────────────────

/** Voice engine state machine */
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

/** Options for the speak() function */
export interface SpeakOptions {
  /**
   * If true, use on-device expo-speech for near-zero latency.
   * Ideal for short confirmations: "Listening", "Got it", "Done".
   * If false (default), use backend Edge-TTS via expo-av for higher quality.
   * Ideal for object descriptions, navigation instructions, long responses.
   */
  instant?: boolean;
}

export interface VoiceContextValue {
  /** Current voice state */
  state: VoiceState;

  /** Start recording audio from the microphone */
  startListening: () => Promise<boolean>;

  /** Stop recording, transcribe via backend, return the transcript */
  stopListening: () => Promise<string | null>;

  /** Cancel any active recording without transcribing */
  cancelListening: () => Promise<void>;

  /**
   * Speak text aloud.
   *   - instant=true: expo-speech (fast, device-side, for confirmations)
   *   - instant=false: backend TTS → expo-av (high-quality, for descriptions)
   */
  speak: (text: string, options?: SpeakOptions) => Promise<void>;

  /** Stop any current speech (TTS playback or expo-speech) */
  stopSpeaking: () => void;

  /** Last transcribed text from voice input */
  lastTranscript: string | null;

  /** Whether the engine is actively listening */
  isListening: boolean;

  /** Whether TTS is currently playing */
  isSpeaking: boolean;

  /** Active error message, if any */
  error: string | null;

  /** Clear the current error */
  clearError: () => void;

  /** Language preference for STT and TTS */
  language: 'en' | 'ar';

  /** Update language preference */
  setLanguage: (lang: 'en' | 'ar') => void;
}

// ─── Context ─────────────────────────────────────────────────────

const VoiceContext = createContext<VoiceContextValue | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────────

interface VoiceProviderProps {
  children: ReactNode;
}

export function VoiceProvider({ children }: VoiceProviderProps) {
  // ── State ──
  const [state, setState] = useState<VoiceState>('idle');
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'ar'>('en');

  // ── Refs (mutable, non-reattached) ──
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const abortRef = useRef(false); // Flag to abort processing if cancelled mid-flight

  // ── Derived ──
  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';

  // ── Error helpers ──
  const clearError = useCallback(() => setError(null), []);

  const handleError = useCallback((msg: string) => {
    setError(msg);
    setState('idle');
  }, []);

  // ──────────────────────────────────────────────────────────────
  // RECORDING: startListening / stopListening / cancelListening
  // ──────────────────────────────────────────────────────────────

  /**
   * Start recording audio from the microphone.
   * Requests permissions, configures the audio session, begins capturing.
   * Returns true if recording started successfully.
   */
  const startListening = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      setLastTranscript(null);
      abortRef.current = false;

      // If already recording or processing, stop any existing recording first
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch {}
        recordingRef.current = null;
      }

      // Stop any playing TTS so it doesn't interfere with recording
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch {}
        soundRef.current = null;
      }
      Speech.stop();

      // Request microphone permission
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        handleError('Microphone permission denied. Please enable it in Settings.');
        return false;
      }

      // Configure audio session for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create and start the recording (high-quality preset)
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );

      recordingRef.current = recording;
      setState('listening');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start recording';
      handleError(msg);
      return false;
    }
  }, [handleError]);

  /**
   * Stop recording, send audio to backend for transcription, return the transcript.
   * Returns null if no audio was captured or transcription failed.
   */
  const stopListening = useCallback(async (): Promise<string | null> => {
    const recording = recordingRef.current;
    if (!recording || state !== 'listening') {
      return null;
    }

    setState('processing');

    try {
      // Stop and unload the recording
      await recording.stopAndUnloadAsync();

      // Reset audio session to allow playback
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        handleError('Recording produced no file.');
        return null;
      }

      // Send to backend for transcription
      const result = await transcribeAudio(uri, language);

      // Check if this was aborted while we were processing
      if (abortRef.current) {
        abortRef.current = false;
        return null;
      }

      setLastTranscript(result.transcript);
      setState('idle');
      return result.transcript;
    } catch (err: unknown) {
      recordingRef.current = null;
      const msg = err instanceof Error ? err.message : 'Transcription failed';
      handleError(msg);
      return null;
    }
  }, [state, language, handleError]);

  /**
   * Cancel any active recording without transcribing.
   * Used when the user wants to abort mid-recording.
   */
  const cancelListening = useCallback(async (): Promise<void> => {
    abortRef.current = true;

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
    }

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    setState('idle');
  }, []);

  // ──────────────────────────────────────────────────────────────
  // TTS: speak() / stopSpeaking()
  // ──────────────────────────────────────────────────────────────

  /**
   * Stop any currently playing speech.
   */
  const stopSpeaking = useCallback(() => {
    Speech.stop();

    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => {});
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }

    // Only reset to idle if we were speaking
    setState((prev) => (prev === 'speaking' ? 'idle' : prev));
  }, []);

  /**
   * Speak text aloud.
   *
   * @param text    The text to speak
   * @param options.instant  If true, use expo-speech for near-zero latency.
   *                         If false (default), use backend TTS → expo-av.
   */
  const speak = useCallback(
    async (text: string, options?: SpeakOptions): Promise<void> => {
      if (!text?.trim()) return;

      const useInstant = options?.instant ?? false;

      // Stop any current speech before starting new
      stopSpeaking();

      if (useInstant) {
        // ── INSTANT MODE: expo-speech (device-side, ~0ms latency) ──
        return new Promise<void>((resolve) => {
          setState('speaking');
          Speech.speak(text, {
            language: language === 'ar' ? 'ar-SA' : 'en-US',
            rate: 0.9,
            onDone: () => {
              setState('idle');
              resolve();
            },
            onStopped: () => {
              setState('idle');
              resolve();
            },
            onError: () => {
              setState('idle');
              resolve();
            },
          });
        });
      }

      // ── HIGH-QUALITY MODE: backend TTS → expo-av ──
      return new Promise<void>(async (resolve) => {
        try {
          setState('speaking');
          const fileUri = await synthesizeSpeech(text, { language });

          const { sound } = await Audio.Sound.createAsync(
            { uri: fileUri },
            { shouldPlay: true },
          );

          soundRef.current = sound;

          // Listen for playback completion
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              sound.unloadAsync().catch(() => {});
              soundRef.current = null;
              setState('idle');
              resolve();
            }
          });
        } catch (err: unknown) {
          // Fallback to expo-speech if backend TTS fails
          console.warn('[VoiceContext] Backend TTS failed, falling back to expo-speech:', err);
          Speech.speak(text, {
            language: language === 'ar' ? 'ar-SA' : 'en-US',
            rate: 0.9,
            onDone: () => {
              setState('idle');
              resolve();
            },
            onStopped: () => {
              setState('idle');
              resolve();
            },
            onError: () => {
              setState('idle');
              resolve();
            },
          });
        }
      });
    },
    [language, stopSpeaking],
  );

  // ── Context value ──
  const value: VoiceContextValue = {
    state,
    startListening,
    stopListening,
    cancelListening,
    speak,
    stopSpeaking,
    lastTranscript,
    isListening,
    isSpeaking,
    error,
    clearError,
    language,
    setLanguage,
  };

  return (
    <VoiceContext.Provider value={value}>
      {children}
    </VoiceContext.Provider>
  );
}

/**
 * Hook to consume voice capabilities. Throws if used outside VoiceProvider.
 */
export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return ctx;
}