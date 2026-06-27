/**
 * src/components/VoiceFeedbackOverlay.tsx
 * Full-screen overlay shown while the app is listening or processing.
 * Provides visual confirmation of voice state for sighted users/caregivers.
 * The spoken state feedback for blind users is handled via TTS + haptics in screens.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { FontSize, FontWeight } from '../constants/typography';
import type { MicState } from './MicButton';

interface VoiceFeedbackOverlayProps {
  visible: boolean;
  state: MicState;
  message?: string;
  onCancel?: () => void;
}

const WAVE_COUNT = 4;

export function VoiceFeedbackOverlay({
  visible,
  state,
  message,
  onCancel,
}: VoiceFeedbackOverlayProps) {
  const waveAnims = useRef(
    Array.from({ length: WAVE_COUNT }, (_, i) => new Animated.Value(0.3 + i * 0.1))
  ).current;

  useEffect(() => {
    if (visible && state === 'recording') {
      const animations = waveAnims.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 120),
            Animated.timing(anim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3 + i * 0.1,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        )
      );
      animations.forEach((a) => a.start());
      return () => animations.forEach((a) => a.stop());
    }
  }, [visible, state]);

  const stateConfig = {
    idle: { emoji: '🎙️', label: 'Ready', color: Colors.accent },
    recording: { emoji: '🔴', label: 'Listening…', color: Colors.error },
    processing: { emoji: '⏳', label: 'Processing…', color: Colors.warning },
  }[state];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <View
          style={styles.card}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={message ?? stateConfig.label}
        >
          {/* Waveform bars */}
          <View style={styles.waveContainer} accessibilityElementsHidden>
            {waveAnims.map((anim, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.waveBar,
                  {
                    backgroundColor: stateConfig.color,
                    transform: [{ scaleY: anim }],
                    opacity: anim,
                  },
                ]}
              />
            ))}
          </View>

          <Text style={styles.emoji} accessibilityElementsHidden>
            {stateConfig.emoji}
          </Text>

          <Text style={[styles.stateLabel, { color: stateConfig.color }]}>
            {stateConfig.label}
          </Text>

          {message ? (
            <Text style={styles.message} numberOfLines={4}>
              {message}
            </Text>
          ) : null}

          {onCancel && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              accessibilityHint="Dismiss this overlay and cancel the current action"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    gap: 6,
    marginBottom: Spacing.md,
  },
  waveBar: {
    width: 6,
    height: 48,
    borderRadius: 3,
  },
  emoji: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  stateLabel: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  message: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: FontSize.md * 1.6,
    marginBottom: Spacing.lg,
  },
  cancelButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
});
