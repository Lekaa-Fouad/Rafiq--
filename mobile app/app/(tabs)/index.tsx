/**
 * app/(tabs)/index.tsx — Home Dashboard
 *
 * The primary screen users land on. VoiceButton is the hero element,
 * flanked by a live status line and a 2×2 grid of shortcut cards.
 *
 * Phase 5: Haptic feedback on grid card taps, loading/processing states
 * with spoken feedback, demo mode banner, and improved a11y labels.
 */

import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { VoiceButton } from '../../src/components/VoiceButton';
import { StatusCard } from '../../src/components/StatusCard';
import { useVoice } from '../../src/contexts/VoiceContext';
import { useDemo } from '../../src/contexts/DemoContext';
import type { Intent } from '../../src/services/intentRouter';
import { Colors, Spacing, BorderRadius } from '../../src/constants/theme';
import { FontSize, FontWeight } from '../../src/constants/typography';

export default function HomeScreen() {
  const router = useRouter();
  const { state } = useVoice();
  const { isDemoMode } = useDemo();

  /** Navigate with haptic feedback */
  const navigateTo = useCallback(
    (path: string) => {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      router.push(path as never);
    },
    [router],
  );

  /** Route intents to the appropriate screen or action */
  const handleIntent = useCallback(
    (intent: Intent) => {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      switch (intent.type) {
        case 'DESCRIBE_SURROUNDINGS':
        case 'DETECT_OBJECTS':
          router.push('/(tabs)/detect');
          break;
        case 'IDENTIFY_FACE':
        case 'REGISTER_FACE':
          router.push('/(tabs)/faces');
          break;
        case 'NAVIGATE_TO':
        case 'START_NAVIGATION':
          router.push('/(tabs)/navigate');
          break;
        case 'READ_TEXT':
          router.push('/ocr');
          break;
        case 'STOP':
        case 'HELP':
        case 'UNKNOWN':
          // Handled by VoiceButton spoken confirmation
          break;
        default:
          break;
      }
    },
    [router],
  );

  /** Map voice state to a human-readable status line */
  const statusLabel =
    state === 'listening'
      ? '🔴 Listening…'
      : state === 'processing'
        ? '⏳ Processing…'
        : state === 'speaking'
          ? '🔊 Speaking…'
          : '✅ Ready — hold the button and speak';

  /** VoiceOver-friendly status for the state line */
  const statusA11y =
    state === 'idle'
      ? 'Ready. Hold the microphone button and speak a command.'
      : state === 'listening'
        ? 'Listening. Speak your command now.'
        : state === 'processing'
          ? 'Processing your voice command. Please wait.'
          : 'Speaking the response.';

  return (
    <ScreenContainer scrollable={false}>
      <View style={styles.container}>
        {/* ── Demo mode banner ──────────────────────────── */}
        {isDemoMode && (
          <View
            style={styles.demoBanner}
            accessibilityLabel="Demo mode is active. Responses are simulated."
          >
            <Text style={styles.demoBannerText}>
              🎭 Demo Mode Active
            </Text>
          </View>
        )}

        {/* ── Live Status ─────────────────────────────────── */}
        <Text
          style={[
            styles.statusLine,
            state === 'listening' && styles.statusListening,
            state === 'processing' && styles.statusProcessing,
          ]}
          accessibilityLabel={statusA11y}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
        >
          {statusLabel}
        </Text>

        {/* ── Hero Voice Button ──────────────────────────── */}
        <View
          style={styles.buttonRow}
          accessibilityLabel="Voice command area"
        >
          <VoiceButton onIntent={handleIntent} />
        </View>

        {/* ── 2×2 Shortcut Grid ─────────────────────────── */}
        <View
          style={styles.grid}
          accessibilityRole="none"
          accessibilityLabel="Feature shortcuts"
        >
          <View style={styles.gridRow}>
            <View style={styles.gridCard}>
              <StatusCard
                icon="🔍"
                title="Detect"
                statusText="Real-time object detection"
                variant="info"
                onPress={() => navigateTo('/(tabs)/detect')}
                accessibilityLabel="Detect Objects. Tap to open real-time object detection with YOLOv8."
              />
            </View>
            <View style={styles.gridCard}>
              <StatusCard
                icon="😊"
                title="Faces"
                statusText="Register & identify"
                variant="info"
                onPress={() => navigateTo('/(tabs)/faces')}
                accessibilityLabel="Face Recognition. Tap to register or identify people."
              />
            </View>
          </View>
          <View style={styles.gridRow}>
            <View style={styles.gridCard}>
              <StatusCard
                icon="🧭"
                title="Navigate"
                statusText="Indoor voice guidance"
                variant="info"
                onPress={() => navigateTo('/(tabs)/navigate')}
                accessibilityLabel="Indoor Navigation. Tap to start voice-guided indoor navigation."
              />
            </View>
            <View style={styles.gridCard}>
              <StatusCard
                icon="📷"
                title="Read Text"
                statusText="OCR & read aloud"
                variant="info"
                onPress={() => navigateTo('/ocr')}
                accessibilityLabel="Read Text. Tap to scan and read text from images using OCR."
              />
            </View>
          </View>
        </View>

        {/* ── Hint Text ──────────────────────────────────── */}
        <Text
          style={styles.hint}
          accessibilityLabel="Tip: Hold the large microphone button above and speak a command to Rafiq. For example, say: What is in front of me?"
        >
          💡 Hold the button and say what you need
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  demoBanner: {
    backgroundColor: Colors.warningLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  demoBannerText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.warning,
  },
  statusLine: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  statusListening: {
    color: Colors.error,
    fontWeight: FontWeight.semibold,
  },
  statusProcessing: {
    color: Colors.accent,
    fontWeight: FontWeight.semibold,
  },
  buttonRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  grid: {
    width: '100%',
    gap: Spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  gridCard: {
    flex: 1,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
});