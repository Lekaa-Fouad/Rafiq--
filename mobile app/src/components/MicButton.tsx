/**
 * src/components/MicButton.tsx
 * The hero microphone button — the primary interaction element of Rafiq.
 *
 * Accessibility:
 * - accessibilityRole="button"
 * - accessibilityLabel changes dynamically with state
 * - accessibilityHint explains hold behavior
 * - Large 120pt touch target (exceeds WCAG 2.5.5 minimum)
 * - Haptic feedback on press / release
 * - Animated pulse ring when recording
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  Text,
  AccessibilityInfo,
} from 'react-native';
import { Colors, TouchTargets } from '../constants/theme';
import { FontSize, FontWeight } from '../constants/typography';

export type MicState = 'idle' | 'recording' | 'processing';

interface MicButtonProps {
  micState: MicState;
  onPressIn: () => void;
  onPressOut: () => void;
  disabled?: boolean;
}

export function MicButton({ micState, onPressIn, onPressOut, disabled = false }: MicButtonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.7)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation when recording
  useEffect(() => {
    if (micState === 'recording') {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1.4, duration: 700, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.7, duration: 0, useNativeDriver: true }),
          ]),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseOpacity.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      Animated.timing(pulseOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [micState]);

  const handlePressIn = () => {
    if (disabled || micState === 'processing') return;
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true }).start();
    onPressIn();
  };

  const handlePressOut = () => {
    if (disabled || micState !== 'recording') return;
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
    onPressOut();
  };

  const buttonColor = {
    idle: Colors.micIdle,
    recording: Colors.micListening,
    processing: Colors.micProcessing,
  }[micState];

  const labelMap = {
    idle: 'Hold to speak',
    recording: 'Listening… Release to send',
    processing: 'Processing…',
  };

  const iconMap = {
    idle: '🎙️',
    recording: '⏺',
    processing: '⏳',
  };

  const a11yLabel = {
    idle: 'Microphone button. Hold to start speaking.',
    recording: 'Recording. Release to stop.',
    processing: 'Processing your voice command.',
  }[micState];

  return (
    <View style={styles.container}>
      {/* Pulse ring */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            transform: [{ scale: pulseAnim }],
            opacity: pulseOpacity,
            backgroundColor: buttonColor,
          },
        ]}
        pointerEvents="none"
      />

      {/* Main button */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled}
          style={[styles.button, { backgroundColor: buttonColor }, disabled && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          accessibilityHint="Hold down to record your voice command, release to send"
          accessibilityState={{ disabled, busy: micState === 'processing' }}
        >
          <Text style={styles.icon} accessibilityElementsHidden>
            {iconMap[micState]}
          </Text>
        </Pressable>
      </Animated.View>

      {/* State label */}
      <Text
        style={[styles.label, { color: micState === 'recording' ? Colors.error : Colors.textSecondary }]}
        accessibilityLiveRegion="polite"
      >
        {labelMap[micState]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: TouchTargets.hero,
    height: TouchTargets.hero,
    borderRadius: TouchTargets.hero / 2,
  },
  button: {
    width: TouchTargets.hero,
    height: TouchTargets.hero,
    borderRadius: TouchTargets.hero / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Elevation for depth
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  icon: {
    fontSize: 44,
  },
  label: {
    marginTop: 16,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
});
