/**
 * src/components/ScreenContainer.tsx
 * Consistent safe-area + padding wrapper used by every screen.
 * Provides uniform layout with optional title and scroll behavior.
 */

import React, { type ReactNode } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, Spacing } from '../constants/theme';
import { FontSize, FontWeight } from '../constants/typography';

export interface ScreenContainerProps {
  /** Screen title displayed at the top */
  title?: string;
  /** Optional subtitle or description */
  subtitle?: string;
  /** Whether content should be scrollable (default: true) */
  scrollable?: boolean;
  /** Content */
  children: ReactNode;
  /** Extra bottom padding (e.g. for tab bar) */
  padBottom?: boolean;
}

export function ScreenContainer({
  title,
  subtitle,
  scrollable = true,
  children,
  padBottom = true,
}: ScreenContainerProps) {
  const content = (
    <>
      {title && (
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {subtitle && (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>
      )}
      {children}
    </>
  );

  if (scrollable) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            padBottom && styles.padBottom,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.fixedContent, padBottom && styles.padBottom]}>
        {content}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  fixedContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  padBottom: {
    paddingBottom: Spacing.xxxl + Spacing.xl,
  },
  header: {
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: FontSize.md * 1.4,
  },
});
