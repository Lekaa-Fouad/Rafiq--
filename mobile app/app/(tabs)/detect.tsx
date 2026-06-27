import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Platform,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { AccessibleButton } from '../../src/components/AccessibleButton';
import { useVoice } from '../../src/contexts/VoiceContext';
import { useDemo, getDemoDetections } from '../../src/contexts/DemoContext';
import { detectObjects } from '../../src/api/detection';
import type { DetectionObject } from '../../src/types/detection';
import { Colors, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { FontSize, FontWeight } from '../../src/constants/typography';

// ── Helpers ──────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FRAME_INTERVAL_MS = 500; // Wait 0.5s after the previous response before taking the next picture

export default function DetectScreen() {
  // ── Camera permissions ────────────────────────────────────────────────
  const [permission, requestPermission] = useCameraPermissions();
  const { isDemoMode } = useDemo();
  const isFocused = useIsFocused();

  // ── Detection state ───────────────────────────────────────────────────
  const [isDetecting, setIsDetecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastDetections, setLastDetections] = useState<DetectionObject[]>([]);
  const [spokenMessage, setSpokenMessage] = useState<string>('');
  
  const lastSpokenRef = useRef<string>('');
  const cameraRef = useRef<CameraView>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoStartedRef = useRef(false);
  const isDetectingRef = useRef(false);

  // ── Voice ─────────────────────────────────────────────────────────────
  const { speak } = useVoice();

  // ── Send a camera frame to the API ─────────────────────────────────
  const sendFrame = useCallback(async () => {
    if (!cameraRef.current || !isDetectingRef.current) return;

    try {
      setIsProcessing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.1, // Compress aggressively for much faster network upload
        skipProcessing: true,
      });

      if (photo?.uri) {
        const response = await detectObjects(photo.uri);
        
        if (response.status === 'success' && response.detections) {
          const det = response.detections;
          setLastDetections(det);
          
          if (det.length > 0) {
            // Build the spoken message from top 3 objects
            const newSpoken = det.slice(0, 3).map(d => d.speech).join('. ');
            
            if (newSpoken !== lastSpokenRef.current) {
              lastSpokenRef.current = newSpoken;
              setSpokenMessage(newSpoken);
              await speak(newSpoken, { instant: false });
            }
          } else {
            setLastDetections([]);
            if (lastSpokenRef.current !== '') {
              lastSpokenRef.current = '';
              setSpokenMessage('No objects detected');
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send frame:', error);
    } finally {
      setIsProcessing(false);
      // Schedule the next frame capture ONLY if we are still detecting
      if (isDetectingRef.current) {
        frameIntervalRef.current = setTimeout(sendFrame, FRAME_INTERVAL_MS);
      }
    }
  }, [speak]);

  // ── Start frame-sending interval ──────────────────────────────────────
  const startFrameLoop = useCallback(() => {
    // Clear any existing timer
    if (frameIntervalRef.current) {
      clearTimeout(frameIntervalRef.current);
    }
    // Start the first frame
    sendFrame();
  }, [sendFrame]);

  const stopFrameLoop = useCallback(() => {
    if (frameIntervalRef.current) {
      clearTimeout(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  }, []);

  /** Start detection using HTTP API. */
  const startDetection = useCallback(async () => {
    if (isDetectingRef.current) return;

    // ── Demo mode: simulate detections ───────────────────────────────────
    if (isDemoMode) {
      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      isDetectingRef.current = true;
      setIsDetecting(true);
      speak('Demo mode: showing simulated detections', { instant: true });

      const interval = setInterval(() => {
        const demoDet = getDemoDetections();
        setLastDetections(demoDet);
        setSpokenMessage(demoDet.map((d) => d.speech).join('. '));
        speak(demoDet.map((d) => d.speech).join('. '), { instant: false });
      }, 7000);

      frameIntervalRef.current = interval as any;
      return;
    }

    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    isDetectingRef.current = true;
    setIsDetecting(true);
    speak('Detection started', { instant: true });
    
    startFrameLoop();
  }, [speak, isDemoMode, startFrameLoop]);

  /** Disconnect and clean up the detection. */
  const stopDetection = useCallback(() => {
    stopFrameLoop();
    isDetectingRef.current = false;
    setIsDetecting(false);
    setIsProcessing(false);
    setLastDetections([]);
    setSpokenMessage('');
    lastSpokenRef.current = '';
    hasAutoStartedRef.current = false;
  }, [stopFrameLoop]);

  // ── Auto-start detection when screen is focused + permission granted ──
  useEffect(() => {
    if (
      isFocused &&
      permission?.granted &&
      !isDetectingRef.current &&
      !hasAutoStartedRef.current
    ) {
      hasAutoStartedRef.current = true;
      // Small delay to let the camera initialize
      const timer = setTimeout(() => {
        startDetection();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isFocused, permission?.granted, startDetection]);

  // ── Stop detection when leaving screen ────────────────────────────────
  useEffect(() => {
    if (!isFocused && isDetectingRef.current) {
      stopDetection();
    }
  }, [isFocused, stopDetection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFrameLoop();
      isDetectingRef.current = false;
    };
  }, [stopFrameLoop]);

  // ── Render ──────────────────────────────────────────────────────────────

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text
          style={styles.permissionText}
          accessibilityLabel="Camera permission is required for object detection. Please grant camera access in your device settings."
        >
          Camera permission is required for object detection.
        </Text>
        <AccessibleButton
          label="Grant Camera Access"
          accessibilityHint="Opens system permission dialog for camera"
          variant="large"
          icon="📷"
          onPress={requestPermission}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Camera Preview ──────────────────────────────── */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        accessible={false}
        accessibilityElementsHidden
      />

      {/* ── Detection Overlay ──────────────────────────── */}
      {isDetecting && lastDetections.length > 0 && (
        <View
          style={styles.overlay}
          accessibilityRole="summary"
          accessibilityLabel={`Detected ${lastDetections.length} objects: ${lastDetections.map(d => d.speech).join('. ')}`}
        >
          {lastDetections.map((obj, i) => (
            <View key={i} style={styles.detectionRow}>
              <Text style={styles.detectionName} numberOfLines={1}>
                {obj.object_name}
              </Text>
              <Text style={styles.detectionMeta} numberOfLines={1}>
                {obj.direction} · {obj.distance}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Status Bar ─────────────────────────────────── */}
      <View style={styles.statusBar} accessibilityLiveRegion="polite">
        <View style={styles.statusRow}>
          <View style={[
            styles.statusDot,
            { backgroundColor: isDetecting ? (isProcessing ? Colors.accent : Colors.success) : Colors.textMuted },
          ]} accessibilityElementsHidden />
          <Text
            style={styles.statusText}
            accessibilityLabel={`Detection status: ${
              isProcessing
                ? 'Processing image...'
                : isDetecting
                  ? 'Actively detecting objects'
                  : 'Detection stopped'
            }`}
          >
            {isProcessing
              ? 'Processing...'
              : isDetecting
                ? 'Detecting'
                : 'Stopped'}
          </Text>
        </View>
        {spokenMessage !== '' && (
          <Text
            style={styles.spokenText}
            numberOfLines={2}
            accessibilityLabel={`Last announcement: ${spokenMessage}`}
          >
            🔊 {spokenMessage}
          </Text>
        )}
      </View>

      {/* ── Controls ───────────────────────────────────── */}
      <View style={styles.controls}>
        {isDetecting ? (
          <AccessibleButton
            label="Stop Detection"
            accessibilityHint="Stops analyzing frames"
            variant="large"
            icon="⏹️"
            onPress={stopDetection}
            style={styles.stopButton}
          />
        ) : (
          <AccessibleButton
            label="Start Detection"
            accessibilityHint="Begins analyzing camera frames for objects"
            variant="large"
            icon="👁️"
            onPress={startDetection}
            style={styles.startButton}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  permissionText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.md * 1.5,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 160,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.overlay,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.md,
  },
  detectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detectionName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    flex: 1,
  },
  detectionMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginLeft: Spacing.sm,
  },
  statusBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.overlay,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
  },
  spokenText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  controls: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: Spacing.md,
    right: Spacing.md,
  },
  stopButton: {
    backgroundColor: Colors.error,
  },
  startButton: {
    backgroundColor: Colors.accent,
  },
});