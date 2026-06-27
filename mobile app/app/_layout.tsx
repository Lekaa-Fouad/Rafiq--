/**
 * app/_layout.tsx
 * Root layout for Expo Router — wraps the entire app in:
 *   1. ThemeProvider  — centralized design tokens
 *   2. VoiceProvider  — voice capabilities
 *   3. DemoProvider   — demo mode toggle (persisted)
 *   4. OnboardingProvider — first-launch onboarding tracking
 *
 * If onboarding hasn't been completed, a modal onboarding screen is shown
 * instead of the main app.
 *
 * Navigation structure:
 *   - (tabs) group: Tab navigator with Home, Detect, Faces, Navigate, Settings
 *   - Stack screens: STT, TTS, OCR (accessible from Home via feature cards)
 *   - onboarding: Modal onboarding flow (first launch only)
 */

import React, { useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { VoiceProvider } from '../src/contexts/VoiceContext';
import { DemoProvider } from '../src/contexts/DemoContext';
import { OnboardingProvider, useOnboarding } from '../src/contexts/OnboardingContext';
import { OnboardingScreen } from '../src/components/OnboardingScreen';
import { Colors } from '../src/constants/theme';
import { FontWeight } from '../src/constants/typography';

/**
 * Inner layout that consumes OnboardingContext.
 * If onboarding is not complete, shows the onboarding modal.
 */
function AppShell() {
  const { isOnboardingComplete, isLoaded, completeOnboarding } = useOnboarding();

  // Show a minimal loading spinner while checking onboarding state
  if (!isLoaded) {
    return (
      <View style={loadingStyles.center}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  // First launch: show onboarding as a full-screen overlay
  if (!isOnboardingComplete) {
    return <OnboardingScreen onComplete={completeOnboarding} />;
  }

  // Normal app navigation
  return (
    <>
      <StatusBar style="light" backgroundColor={Colors.background} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.textPrimary,
          headerTitleStyle: {
            fontWeight: FontWeight.semibold,
            color: Colors.textPrimary,
          },
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        {/* Tab navigator — no header (tabs have their own) */}
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />

        {/* Modal / Stack screens — accessible from Home feature cards */}
        <Stack.Screen
          name="stt"
          options={{ title: '🎙️ Voice Input' }}
        />
        <Stack.Screen
          name="tts"
          options={{ title: '🔊 Text to Speech' }}
        />
        <Stack.Screen
          name="ocr"
          options={{ title: '📷 Read Text (OCR)' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <DemoProvider>
        <OnboardingProvider>
          <VoiceProvider>
            <AppShell />
          </VoiceProvider>
        </OnboardingProvider>
      </DemoProvider>
    </ThemeProvider>
  );
}

const loadingStyles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});