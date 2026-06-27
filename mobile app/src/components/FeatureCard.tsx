/**
 * src/components/FeatureCard.tsx
 * Navigation card on the home screen for each feature.
 * Large touch target, accessible, shows feature status (implemented vs stub).
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Spacing, BorderRadius, TouchTargets } from '../constants/theme';
import { FontSize, FontWeight } from '../constants/typography';

interface FeatureCardProps {
  emoji: string;
  title: string;
  description: string;
  status: 'live' | 'coming-soon';
  onPress: () => void;
}

export function FeatureCard({ emoji, title, description, status, onPress }: FeatureCardProps) {
  const isLive = status === 'live';

  return (
    <TouchableOpacity
      style={[styles.card, !isLive && styles.cardDimmed]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}. ${isLive ? 'Ready to use.' : 'Coming soon.'}`}
      accessibilityHint={`Double-tap to open ${title}`}
      accessibilityState={{ disabled: false }}
    >
      <View style={styles.row}>
        <Text style={styles.emoji} accessibilityElementsHidden>
          {emoji}
        </Text>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        </View>
        {!isLive && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Soon</Text>
          </View>
        )}
        {isLive && (
          <Text style={styles.arrow} accessibilityElementsHidden>›</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: TouchTargets.minimum,
  },
  cardDimmed: {
    opacity: 0.65,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  emoji: {
    fontSize: 36,
    width: 44,
    textAlign: 'center',
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    marginBottom: 2,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
  },
  badge: {
    backgroundColor: Colors.warningLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  badgeText: {
    color: Colors.warning,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
  },
  arrow: {
    color: Colors.textSecondary,
    fontSize: FontSize.xxl,
  },
});
