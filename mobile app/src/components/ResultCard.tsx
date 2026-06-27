/**
 * src/components/ResultCard.tsx
 * Displays a text result with an optional "Speak Again" button.
 * Used across STT, Face, OCR, and Detection screens.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { FontSize, FontWeight } from '../constants/typography';

interface ResultCardProps {
  title: string;
  content: string;
  subtitle?: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  onSpeakAgain?: () => void;
  isSpeaking?: boolean;
}

export function ResultCard({
  title,
  content,
  subtitle,
  type = 'info',
  onSpeakAgain,
  isSpeaking = false,
}: ResultCardProps) {
  const typeStyles = {
    success: {
      border: Colors.success,
      bg: Colors.successLight,
      icon: '✅',
    },
    error: {
      border: Colors.error,
      bg: Colors.errorLight,
      icon: '❌',
    },
    info: {
      border: Colors.accent,
      bg: Colors.accentGlow,
      icon: '💬',
    },
    warning: {
      border: Colors.warning,
      bg: Colors.warningLight,
      icon: '⚠️',
    },
  }[type];

  return (
    <View
      style={[styles.card, { borderColor: typeStyles.border, backgroundColor: typeStyles.bg }]}
      accessible
      accessibilityRole="none"
      accessibilityLabel={`${title}: ${content}`}
    >
      <View style={styles.header}>
        <Text style={styles.icon} accessibilityElementsHidden>
          {typeStyles.icon}
        </Text>
        <Text style={[styles.title, { color: typeStyles.border }]}>{title}</Text>
      </View>

      <Text style={styles.content} selectable>
        {content}
      </Text>

      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {onSpeakAgain && (
        <TouchableOpacity
          style={[styles.speakButton, { borderColor: typeStyles.border }]}
          onPress={onSpeakAgain}
          accessibilityRole="button"
          accessibilityLabel={isSpeaking ? 'Stop speaking' : 'Speak this result again'}
          accessibilityHint="Double-tap to have the result read aloud"
        >
          <Text style={[styles.speakButtonText, { color: typeStyles.border }]}>
            {isSpeaking ? '⏹ Stop' : '🔊 Speak Again'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  icon: {
    fontSize: FontSize.lg,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  content: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
    lineHeight: FontSize.lg * 1.6,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  speakButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakButtonText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
});
