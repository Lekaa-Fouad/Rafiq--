/**
 * src/components/VoiceButton.tsx
 * The primary interaction control for Rafiq — a large, full-width, circular button.
 *
 * Press-and-hold to talk, release to stop and process.
 * - Haptic pulse on press-start and release
 * - Visual state changes (idle/listening/processing) are dramatic and obvious
 *   for both blind users (via VoiceOver) and sighted demo observers
 *
 * On result, routes through intentRouter and fires onIntent(intent).
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Spacing, BorderRadius, TouchTargets } from '../constants/theme';
import { FontSize, FontWeight } from '../constants/typography';
import { useVoice, type VoiceState } from '../contexts/VoiceContext';
import { useHaptics } from '../hooks/useHaptics';
import * as Speech from 'expo-speech';
import {
  classifyIntent,
  getSpokenConfirmation,
  type Intent,
} from '../services/intentRouter';

// ─── Props ───────────────────────────────────────────────────────

interface VoiceButtonProps {
  /** Called when an intent is classified from a voice command */
  onIntent: (intent: Intent) => void;
}

// ─── Component ───────────────────────────────────────────────────

export function VoiceButton({ onIntent }: VoiceButtonProps) {
  const {
    state,
    startListening,
    stopListening,
    speak,
    language,
    error,
    clearError,
  } = useVoice();

  const haptics = useHaptics();

  // ── Animations ──
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // ── Color based on state ──
  const stateColor: Record<VoiceState, string> = {
    idle: Colors.micIdle,
    listening: Colors.micListening,
    processing: Colors.micProcessing,
    speaking: Colors.accent,
  };

  const bgColor = stateColor[state];

  // ── Pulse animation when listening ──
  useEffect(() => {
    if (state === 'listening') {
      // Continuous pulse
      const loop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1.6, duration: 800, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          ]),
        ]),
      );
      loop.start();

      // Glow on
      Animated.timing(glowAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

      return () => {
        loop.stop();
        pulseAnim.setValue(1);
        pulseOpacity.setValue(0);
      };
    }

    // Not listening — fade out pulse and glow
    Animated.parallel([
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(pulseOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: state === 'processing' ? 1 : 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [state]);

  // ── Press-in: start recording ──
  const handlePressIn = useCallback(async () => {
    if (state === 'processing' || state === 'speaking') return;

    clearError();
    await haptics.startAction();

    // Scale down for tactile feedback
    Animated.spring(scaleAnim, { toValue: 0.88, useNativeDriver: true }).start();

    const success = await startListening();
    if (!success) {
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
      await haptics.error();
      return;
    }

    // Fire-and-forget spoken confirmation — use Speech.speak() directly
    // instead of speak() to avoid changing the state machine from 'listening'
    // to 'speaking' (which would break the press-and-hold flow).
    Speech.speak('Listening', { language: 'en-US', rate: 1.1 });
  }, [state, clearError, haptics, startListening, scaleAnim]);

  // ── Press-out: stop recording, transcribe, classify, speak confirmation ──
  const handlePressOut = useCallback(async () => {
    if (state !== 'listening') return;

    // Scale back up
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
    await haptics.completeAction();

    // Stop any "Listening" TTS that might still be playing
    const transcript = await stopListening();

    if (!transcript) {
      // Nothing recorded or cancelled
      return;
    }

    // Classify intent from transcript
    const intent = classifyIntent(transcript, language);

    // Speak a confirmation for the recognized intent
    const confirmation = getSpokenConfirmation(intent, language);
    if (confirmation) {
      await speak(confirmation, { instant: true });
    }

    // Emit intent for the parent screen to act on
    onIntent(intent);
  }, [state, scaleAnim, haptics, stopListening, language, speak, onIntent]);

  // ── Accessibility labels ──
  const a11yLabel: Record<VoiceState, string> = {
    idle: 'Voice button. Press and hold to speak.',
    listening: 'Listening. Release to stop.',
    processing: 'Processing your voice command.',
    speaking: 'Speaking response.',
  };

  const hint: Record<VoiceState, string> = {
    idle: 'Hold down to record your voice command',
    listening: 'Release to stop recording',
    processing: 'Please wait',
    speaking: 'Playing response',
  };

  // ── Icon/label text ──
  const iconMap: Record<VoiceState, string> = {
    idle: '🎙️',
    listening: '🔴',
    processing: '⏳',
    speaking: '🔊',
  };

  const labelMap: Record<VoiceState, string> = {
    idle: 'Hold to speak',
    listening: 'Listening...',
    processing: 'Processing...',
    speaking: 'Speaking...',
  };

  return (
    <View style={styles.container}>
      {/* Pulse ring — only visible when listening */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            transform: [{ scale: pulseAnim }],
            opacity: pulseOpacity,
            backgroundColor: Colors.micListening,
          },
        ]}
        pointerEvents="none"
      />

      {/* Glow behind button */}
      <Animated.View
        style={[
          styles.glow,
          {
            opacity: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.5],
            }),
            backgroundColor: bgColor,
          },
        ]}
        pointerEvents="none"
      />

      {/* Main button */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={state === 'processing' || state === 'speaking'}
          style={[
            styles.button,
            { backgroundColor: bgColor },
            (state === 'processing' || state === 'speaking') && styles.disabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel[state]}
          accessibilityHint={hint[state]}
          accessibilityState={{
            disabled: state === 'processing' || state === 'speaking',
            busy: state === 'processing',
          }}
        >
          <Text style={styles.icon} accessibilityElementsHidden>
            {iconMap[state]}
          </Text>
        </Pressable>
      </Animated.View>

      {/* State label */}
      <Text
        style={[
          styles.label,
          { color: state === 'listening' ? Colors.error : Colors.textSecondary },
        ]}
        accessibilityLiveRegion="polite"
      >
        {labelMap[state]}
      </Text>

      {/* Error message */}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  pulseRing: {
    position: 'absolute',
    width: TouchTargets.hero,
    height: TouchTargets.hero,
    borderRadius: TouchTargets.hero / 2,
  },
  glow: {
    position: 'absolute',
    width: TouchTargets.hero + 40,
    height: TouchTargets.hero + 40,
    borderRadius: (TouchTargets.hero + 40) / 2,
  },
  button: {
    width: TouchTargets.hero,
    height: TouchTargets.hero,
    borderRadius: TouchTargets.hero / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  disabled: {
    opacity: 0.5,
  },
  icon: {
    fontSize: 44,
  },
  label: {
    marginTop: Spacing.md,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  error: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.error,
    textAlign: 'center',
    maxWidth: 280,
  },
});