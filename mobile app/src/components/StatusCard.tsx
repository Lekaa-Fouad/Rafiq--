/**
 * src/components/StatusCard.tsx
 * Dashboard tile — shows icon + title + short status text.
 * Fully VoiceOver/TalkBack labeled. Used on the Home screen.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadows, TouchTargets } from '../constants/theme';
import { FontSize, FontWeight } from '../constants/typography';

export type StatusCardVariant = 'info' | 'success' | 'warning' | 'error';

export interface StatusCardProps {
  /** Emoji or text icon */
  icon: string;
  /** Card title */
  title: string;
  /** Short status description */
  statusText: string;
  /** Semantic color variant */
  variant?: StatusCardVariant;
  /** Optional press handler — makes the card tappable */
  onPress?: () => void;
  /** Custom accessibility label (auto-generated if omitted) */
  accessibilityLabel?: string;
}

const VARIANT_COLORS: Record<StatusCardVariant, { bg: string; text: string; border: string }> = {
  info: { bg: Colors.backgroundCard, text: Colors.textSecondary, border: Colors.border },
  success: { bg: Colors.successLight, text: Colors.success, border: Colors.success },
  warning: { bg: Colors.warningLight, text: Colors.warning, border: Colors.warning },
  error: { bg: Colors.errorLight, text: Colors.error, border: Colors.error },
};

export function StatusCard({
  icon,
  title,
  statusText,
  variant = 'info',
  onPress,
  accessibilityLabel,
}: StatusCardProps) {
  const colors = VARIANT_COLORS[variant];
  const autoLabel = accessibilityLabel || `${title}. ${statusText}`;

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.bg, borderColor: colors.border },
  ];

  const content = (
    <>
      <Text style={styles.icon} accessibilityElementsHidden>
        {icon}
      </Text>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.status, { color: colors.text }]} numberOfLines={2}>
          {statusText}
        </Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={autoLabel}
        accessibilityHint={`Double-tap to open ${title}`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={cardStyle}
      accessibilityRole="summary"
      accessibilityLabel={autoLabel}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    minHeight: TouchTargets.minimum,
    ...Shadows.sm,
  },
  icon: {
    fontSize: 32,
    width: 40,
    textAlign: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  status: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.4,
  },
});
