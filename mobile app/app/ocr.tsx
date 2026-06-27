/**
 * app/ocr.tsx — OCR Screen
 *
 * Fully functional:
 *   1. Camera captures a photo
 *   2. POST /ocr/to-voice → returns MP3 bytes → play audio immediately
 *   3. Also offers POST /ocr to show text separately
 *
 * Verified against backend/routers/ocr.py.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';

import { ResultCard } from '../src/components/ResultCard';
import { useTextToSpeech } from '../src/hooks/useTextToSpeech';
import { useHaptics } from '../src/hooks/useHaptics';
import { extractText, extractTextToSpeech } from '../src/api/ocr';
import { Colors, Spacing, BorderRadius, TouchTargets } from '../src/constants/theme';
import { FontSize, FontWeight } from '../src/constants/typography';
import type { OCRResponse } from '../src/types/api';

export default function OCRScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const haptics = useHaptics();
  const { speak, isPlaying } = useTextToSpeech();

  const [extractedText, setExtractedText] = useState<OCRResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'listen' | 'text'>('listen');

  const capturePhoto = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current) return null;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
    return photo?.uri ?? null;
  }, []);

  // Mode: OCR → immediate audio playback (ocr/to-voice)
  const handleReadAloud = useCallback(async () => {
    setError(null);
    await haptics.startAction();
    await speak('Capturing image. Please hold still.');

    const uri = await capturePhoto();
    if (!uri) {
      setError('Photo capture failed. Please try again.');
      await speak('Photo capture failed.');
      return;
    }

    setIsLoading(true);
    try {
      const arrayBuffer = await extractTextToSpeech(uri);

      await haptics.success();

      // Write to temp file and play
      const tempUri = `${FileSystem.cacheDirectory}ocr_${Date.now()}.mp3`;
      const bytes = new Uint8Array(arrayBuffer);
      const base64 = btoa(String.fromCharCode(...bytes));
      await FileSystem.writeAsStringAsync(tempUri, base64, {
        encoding: 'base64' as const,
      });

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: tempUri }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((s) => {
        if ('didJustFinish' in s && s.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
        }
      });
    } catch (err: any) {
      await haptics.error();
      const msg = err?.response?.data?.spoken_message ?? err?.message ?? 'OCR failed.';
      setError(msg);
      await speak(msg);
    } finally {
      setIsLoading(false);
    }
  }, [capturePhoto, haptics, speak]);

  // Mode: OCR → show text only
  const handleExtractText = useCallback(async () => {
    setError(null);
    setExtractedText(null);
    await haptics.startAction();

    const uri = await capturePhoto();
    if (!uri) {
      setError('Photo capture failed.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await extractText(uri);
      if (res.success && res.data) {
        setExtractedText(res.data);
        await haptics.success();
        const msg = res.data.full_text || 'No text detected in image.';
        await speak(msg);
      } else {
        throw new Error(res.spoken_message);
      }
    } catch (err: any) {
      await haptics.error();
      const msg = err?.response?.data?.spoken_message ?? err?.message ?? 'Text extraction failed.';
      setError(msg);
      await speak(msg);
    } finally {
      setIsLoading(false);
    }
  }, [capturePhoto, haptics, speak]);

  if (!permission) return <View style={styles.safeArea} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText} accessibilityLabel="Camera access is required to scan and read text from images.">Camera access is required for OCR.</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}
            accessibilityRole="button" accessibilityLabel="Grant camera permission"
            accessibilityHint="Opens the system dialog to allow camera access">
            <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Camera */}
      <View style={styles.cameraContainer} accessibilityElementsHidden>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.scanFrame} pointerEvents="none">
          {/* Scan corners — decorative */}
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
        <Text style={styles.cameraHint} accessibilityElementsHidden>Point at text you want to read</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Mode selector */}
        <View style={styles.modeRow} accessibilityRole="radiogroup"
          accessibilityLabel="Choose OCR mode">
          <TouchableOpacity
            style={[styles.modeButton, mode === 'listen' && styles.modeButtonActive]}
            onPress={() => { setMode('listen'); haptics.tap(); }}
            accessibilityRole="radio"
            accessibilityLabel="Listen mode: capture and read aloud immediately"
            accessibilityState={{ selected: mode === 'listen' }}
          >
            <Text style={[styles.modeText, mode === 'listen' && styles.modeTextActive]}>
              🔊 Listen
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'text' && styles.modeButtonActive]}
            onPress={() => { setMode('text'); haptics.tap(); }}
            accessibilityRole="radio"
            accessibilityLabel="Text mode: show extracted text on screen"
            accessibilityState={{ selected: mode === 'text' }}
          >
            <Text style={[styles.modeText, mode === 'text' && styles.modeTextActive]}>
              📝 Show Text
            </Text>
          </TouchableOpacity>
        </View>

        {/* Capture button */}
        <TouchableOpacity
          style={[styles.captureButton, isLoading && styles.buttonDisabled]}
          onPress={mode === 'listen' ? handleReadAloud : handleExtractText}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={
            isLoading
              ? 'Processing…'
              : mode === 'listen'
              ? 'Capture and read text aloud'
              : 'Capture and extract text'
          }
          accessibilityHint="Takes a photo and sends it to the OCR engine"
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : (
            <Text style={styles.captureButtonText}>
              {mode === 'listen' ? '📷 Read Aloud' : '📷 Extract Text'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Results */}
        {extractedText && mode === 'text' && (
          <ResultCard
            title="Extracted Text"
            content={extractedText.full_text || '(No text found)'}
            subtitle={`${extractedText.annotations.length} text region(s) detected`}
            type={extractedText.full_text ? 'success' : 'warning'}
            onSpeakAgain={() => speak(extractedText.full_text || 'No text found')}
            isSpeaking={isPlaying}
          />
        )}

        {error && (
          <ResultCard
            title="Error"
            content={error}
            type="error"
            onSpeakAgain={() => speak(error)}
            isSpeaking={isPlaying}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  permissionContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, gap: Spacing.lg,
  },
  permissionText: {
    color: Colors.textPrimary, fontSize: FontSize.lg,
    textAlign: 'center', lineHeight: FontSize.lg * 1.6,
  },
  permissionButton: {
    backgroundColor: Colors.accent, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    minHeight: TouchTargets.minimum, justifyContent: 'center',
  },
  permissionButtonText: {
    color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: FontWeight.semibold,
  },
  cameraContainer: {
    height: 280, backgroundColor: '#000', position: 'relative', overflow: 'hidden',
  },
  camera: { flex: 1 },
  scanFrame: {
    position: 'absolute', top: 40, right: 40, bottom: 40, left: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: Colors.accent,
  },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  cameraHint: {
    position: 'absolute', bottom: Spacing.sm, alignSelf: 'center',
    color: Colors.textPrimary, fontSize: FontSize.xs,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: Spacing.sm,
    paddingVertical: 2, borderRadius: BorderRadius.sm,
  },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  modeRow: {
    flexDirection: 'row', borderRadius: BorderRadius.lg,
    backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.lg, overflow: 'hidden',
  },
  modeButton: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center',
  },
  modeButtonActive: { backgroundColor: Colors.accentGlow },
  modeText: {
    color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: FontWeight.medium,
  },
  modeTextActive: { color: Colors.accent, fontWeight: FontWeight.semibold },
  captureButton: {
    backgroundColor: Colors.accent, borderRadius: BorderRadius.full,
    minHeight: TouchTargets.large, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  buttonDisabled: { opacity: 0.4 },
  captureButtonText: {
    color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: FontWeight.bold,
  },
});
