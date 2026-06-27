/**
 * app/(tabs)/settings.tsx — Settings
 *
 * App preferences: language, accessibility, demo mode, server config, about.
 * Phase 5: Added demo mode toggle, haptic feedback on all controls.
 */

import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Switch, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { AccessibleButton } from '../../src/components/AccessibleButton';
import { useDemo } from '../../src/contexts/DemoContext';
import { Colors, Spacing, BorderRadius } from '../../src/constants/theme';
import { FontSize, FontWeight } from '../../src/constants/typography';

interface SettingRowProps {
  icon: string;
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ icon, label, description, children }: SettingRowProps) {
  return (
    <View
      style={settingRowStyles.row}
      accessibilityLabel={`${label}. ${description}`}
    >
      <Text style={settingRowStyles.icon} accessibilityElementsHidden>
        {icon}
      </Text>
      <View style={settingRowStyles.textBlock}>
        <Text style={settingRowStyles.label}>{label}</Text>
        <Text style={settingRowStyles.description}>{description}</Text>
      </View>
      <View style={settingRowStyles.control}>{children}</View>
    </View>
  );
}

const settingRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  icon: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: FontSize.sm * 1.3,
  },
  control: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
});

export default function SettingsScreen() {
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [highContrast, setHighContrast] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const { isDemoMode, toggleDemoMode } = useDemo();

  /** Fire a haptic tap whenever any setting toggles */
  const withHaptic = useCallback(async (action: () => void) => {
    action();
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, []);

  return (
    <ScreenContainer
      title="Settings"
      subtitle="Customize Rafiq to work best for you."
    >
      {/* ── Demo Mode ─────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Demo Mode
        </Text>
        <View style={styles.sectionCard}>
          <SettingRow
            icon="🎭"
            label="Demo Mode"
            description={
              isDemoMode
                ? 'ON — mic, camera, and API calls are simulated'
                : 'OFF — using live backend and device sensors'
            }
          >
            <Switch
              value={isDemoMode}
              onValueChange={() => withHaptic(toggleDemoMode)}
              trackColor={{ false: Colors.backgroundInput, true: Colors.warning }}
              thumbColor={Colors.textPrimary}
              accessibilityLabel={`Demo mode toggle. Currently ${isDemoMode ? 'on' : 'off'}`}
              accessibilityHint="When on, simulates responses without using camera or microphone"
              accessibilityRole="switch"
            />
          </SettingRow>
        </View>
      </View>

      {/* ── Language ──────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Language & Voice
        </Text>
        <View style={styles.sectionCard}>
          <SettingRow
            icon="🌐"
            label="Language"
            description={language === 'en' ? 'English' : 'العربية (Arabic)'}
          >
            <AccessibleButton
              label={language === 'en' ? 'EN' : 'AR'}
              accessibilityLabel={`Language: ${language === 'en' ? 'English' : 'Arabic'}. Tap to switch.`}
              accessibilityHint="Switches between English and Arabic"
              variant="outline"
              onPress={() => withHaptic(() => setLanguage((l) => (l === 'en' ? 'ar' : 'en')))}
              style={styles.compactButton}
            />
          </SettingRow>

          <SettingRow
            icon="🔊"
            label="Auto-speak Results"
            description="Read results aloud automatically"
          >
            <Switch
              value={autoSpeak}
              onValueChange={(v) => withHaptic(() => setAutoSpeak(v))}
              trackColor={{ false: Colors.backgroundInput, true: Colors.accent }}
              thumbColor={Colors.textPrimary}
              accessibilityLabel="Auto-speak results toggle"
              accessibilityHint="When on, results are spoken aloud automatically"
              accessibilityRole="switch"
            />
          </SettingRow>
        </View>
      </View>

      {/* ── Accessibility ─────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Accessibility
        </Text>
        <View style={styles.sectionCard}>
          <SettingRow
            icon="🎯"
            label="High Contrast"
            description="Maximum contrast for better visibility"
          >
            <Switch
              value={highContrast}
              onValueChange={(v) => withHaptic(() => setHighContrast(v))}
              trackColor={{ false: Colors.backgroundInput, true: Colors.accent }}
              thumbColor={Colors.textPrimary}
              accessibilityLabel="High contrast mode toggle"
              accessibilityHint="Enables maximum contrast for better visibility"
              accessibilityRole="switch"
            />
          </SettingRow>

          <SettingRow
            icon="📳"
            label="Haptic Feedback"
            description="Vibration feedback on interactions"
          >
            <Switch
              value={hapticFeedback}
              onValueChange={(v) => withHaptic(() => setHapticFeedback(v))}
              trackColor={{ false: Colors.backgroundInput, true: Colors.accent }}
              thumbColor={Colors.textPrimary}
              accessibilityLabel="Haptic feedback toggle"
              accessibilityHint="Enables vibration feedback on button presses and interactions"
              accessibilityRole="switch"
            />
          </SettingRow>
        </View>
      </View>

      {/* ── Server ────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Server
        </Text>
        <View style={styles.sectionCard}>
          <SettingRow
            icon="🖥️"
            label="API Server"
            description={'http://10.0.2.2:8000'}
          >
            <Text
              style={styles.connectedText}
              accessibilityLabel={
                isDemoMode
                  ? 'Demo mode active, server not connected'
                  : 'Server status indicator'
              }
            >
              {isDemoMode ? '⚡' : '●'}
            </Text>
          </SettingRow>
        </View>
      </View>

      {/* ── About ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          About
        </Text>
        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>Rafiq — رفيق</Text>
          <Text style={styles.aboutVersion}>Version 1.0.0</Text>
          <Text style={styles.aboutDesc}>
            AI-powered accessibility assistant for visually impaired users.
            Built as a graduation project using computer vision, speech
            recognition, and natural language processing.
          </Text>
          <View style={styles.techStack}>
            <Text style={styles.techLabel}>Tech Stack</Text>
            <Text style={styles.techText}>
              Expo • React Native • FastAPI • YOLOv8 • DeepFace • Faster-Whisper • Edge-TTS
            </Text>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  sectionCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  compactButton: {
    minHeight: 40,
    minWidth: 48,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  connectedText: {
    color: Colors.success,
    fontSize: 18,
  },
  aboutCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  aboutTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  aboutVersion: {
    fontSize: FontSize.sm,
    color: Colors.accent,
    fontWeight: FontWeight.semibold,
  },
  aboutDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: FontSize.sm * 1.6,
  },
  techStack: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 4,
  },
  techLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  techText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: FontSize.sm * 1.4,
  },
});