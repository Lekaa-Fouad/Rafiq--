/**
 * src/hooks/useTextToSpeech.ts
 * TTS hook that:
 *   1. Calls backend POST /voice/tts to get MP3 bytes
 *   2. Writes the bytes to a temp file
 *   3. Plays the file using expo-av Sound
 *
 * Falls back to expo-speech if backend TTS fails (network error / backend down).
 */

import { Audio, AVPlaybackStatus } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { useState, useRef, useCallback } from 'react';
import { synthesiseSpeech } from '../api/voice';

export type TTSState = 'idle' | 'loading' | 'playing' | 'error';

export function useTextToSpeech() {
  const [ttsState, setTtsState] = useState<TTSState>('idle');
  const [error, setError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
    Speech.stop();
    setTtsState('idle');
  }, []);

  /**
   * Speak text using backend TTS (Edge-TTS).
   * Falls back to expo-speech if backend is unreachable.
   */
  const speak = useCallback(async (
    text: string,
    options?: { voice?: string; rate?: string; language?: 'ar' | 'en' }
  ): Promise<void> => {
    if (!text.trim()) return;

    await stop();
    setError(null);
    setTtsState('loading');

    try {
      // 1. Get MP3 bytes from backend
      const arrayBuffer = await synthesiseSpeech(text, options?.voice, options?.rate, options?.language);

      // 2. Write to temp file
      const tempUri = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
      const bytes = new Uint8Array(arrayBuffer);
      const base64 = btoa(String.fromCharCode(...bytes));
      await FileSystem.writeAsStringAsync(tempUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 3. Play with expo-av
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: tempUri },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setTtsState('playing');

      // Cleanup when done
      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if ('didJustFinish' in status && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
          soundRef.current = null;
          setTtsState('idle');
        }
      });
    } catch (backendErr) {
      console.warn('[TTS] Backend failed, falling back to expo-speech:', backendErr);

      // Fallback: expo-speech (device TTS — lower quality but always available)
      try {
        Speech.speak(text, {
          language: options?.language === 'ar' ? 'ar' : 'en',
          onDone: () => setTtsState('idle'),
          onError: () => {
            setError('Speech synthesis failed.');
            setTtsState('error');
          },
        });
        setTtsState('playing');
      } catch (fallbackErr) {
        setError('Could not speak text. Please check your connection.');
        setTtsState('error');
      }
    }
  }, [stop]);

  const isPlaying = ttsState === 'playing';
  const isLoading = ttsState === 'loading';

  return { speak, stop, ttsState, isPlaying, isLoading, error };
}
