/**
 * src/components/AccessibleButton.tsx
 * Accessible button primitive — minimum 64x64pt touch target,
 * haptic feedback on press, full VoiceOver/TalkBack support.
 */

import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, TouchTargets } from '../constants/theme';
import { FontSize, FontWeight } from '../constants/typography';

export interface AccessibleButtonProps {
  /** Text displayed on the button */
  label: string;
  /** VoiceOver/TalkBack description (defaults to label) */
  accessibilityLabel?: string;
  /** VoiceOver/TalkBack action hint */
  accessibilityHint?: string;
  /** Press handler */
  onPress: () => void;
  /** Visual variant */
  variant?: 'default' | 'large' | 'danger' | 'outline' | 'ghost';
  /** Optional emoji or text icon shown before label */
  icon?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Shows spinner and disables interaction */
  loading?: boolean;
  /** Additional container styles */
  style?: ViewStyle;
}

export function AccessibleButton({
  label,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  variant = 'default',
  icon,
  disabled = false,
  loading = false,
  style,
}: AccessibleButtonProps) {
  const isDisabled = disabled || loading;

  const handlePress = useCallback(() => {
    if (isDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }, [isDisabled, onPress]);

  const containerStyles: ViewStyle[] = [
    styles.base,
    variantStyles[variant],
    isDisabled && styles.disabled,
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];

  const textStyles: TextStyle[] = [
    styles.label,
    variant === 'large' && styles.labelLarge,
    variant === 'outline' && styles.labelOutline,
    variant === 'ghost' && styles.labelGhost,
    variant === 'danger' && styles.labelDanger,
  ].filter(Boolean) as TextStyle[];

  return (
    <TouchableOpacity
      style={containerStyles}
      onPress={handlePress}
      activeOpacity={0.7}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' || variant === 'ghost' ? Colors.accent : Colors.textPrimary}
          size="small"
        />
      ) : (
        <View style={styles.content}>
          {icon && (
            <Text style={styles.icon} accessibilityElementsHidden>
              {icon}
            </Text>
          )}
          <Text style={textStyles}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TouchTargets.minimum,
    minWidth: TouchTargets.minimum,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  labelLarge: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  labelOutline: {
    color: Colors.accent,
  },
  labelGhost: {
    color: Colors.accent,
  },
  labelDanger: {
    color: Colors.textPrimary,
  },
  icon: {
    fontSize: 22,
  },
  disabled: {
    opacity: 0.45,
  },
});

const variantStyles: Record<string, ViewStyle> = StyleSheet.create({
  default: {
    backgroundColor: Colors.accent,
  },
  large: {
    backgroundColor: Colors.accent,
    minHeight: TouchTargets.large,
    width: '100%' as any,
    borderRadius: BorderRadius.lg,
  },
  danger: {
    backgroundColor: Colors.error,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
});
