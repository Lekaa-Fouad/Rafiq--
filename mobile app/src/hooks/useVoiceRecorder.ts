/**
 * src/hooks/useVoiceRecorder.ts
 * Voice recording hook using expo-av Audio.Recording.
 *
 * Flow:
 *   1. startRecording() — requests mic permission, begins recording
 *   2. stopRecording()  — stops, returns local file URI for upload
 *
 * Returns:
 *   isRecording     — true while mic is active
 *   recordingUri    — file URI after recording completes (null otherwise)
 *   startRecording  — begin capturing
 *   stopRecording   — end capturing, resolves URI
 *   error           — last error message (null if none)
 */

import { Audio } from 'expo-av';
import { useState, useRef, useCallback } from 'react';

export type RecordingState = 'idle' | 'recording' | 'processing';

export function useVoiceRecorder() {
  const [state, setState] = useState<RecordingState>('idle');
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    setRecordingUri(null);

    try {
      // Request permission
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setError('Microphone permission denied. Please enable it in Settings.');
        return false;
      }

      // Configure audio session
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create and start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setState('recording');
      return true;
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to start recording';
      setError(msg);
      setState('idle');
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recordingRef.current || state !== 'recording') return null;

    setState('processing');

    try {
      await recordingRef.current.stopAndUnloadAsync();

      // Reset audio session to allow playback
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (uri) {
        setRecordingUri(uri);
        setState('idle');
        return uri;
      } else {
        setError('Recording produced no file.');
        setState('idle');
        return null;
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to stop recording';
      setError(msg);
      setState('idle');
      recordingRef.current = null;
      return null;
    }
  }, [state]);

  const cancelRecording = useCallback(async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    setState('idle');
    setRecordingUri(null);
  }, []);

  return {
    recordingState: state,
    isRecording: state === 'recording',
    recordingUri,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
