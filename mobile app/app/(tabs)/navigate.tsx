/**
 * app/(tabs)/navigate.tsx — Indoor Navigation
 *
 * Phase 5: Demo mode shows a simulated route with step-by-step directions.
 * Haptic feedback on start navigation and each step announcement.
 * Loading state with spoken feedback for blind users.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { StatusCard } from '../../src/components/StatusCard';
import { AccessibleButton } from '../../src/components/AccessibleButton';
import { useVoice } from '../../src/contexts/VoiceContext';
import { useDemo, getDemoDirections } from '../../src/contexts/DemoContext';
import { Colors, Spacing, BorderRadius } from '../../src/constants/theme';
import { FontSize, FontWeight } from '../../src/constants/typography';

interface DemoStep {
  instruction: string;
  direction: string;
  distance: string;
}

interface DemoRoute {
  destination: string;
  steps: DemoStep[];
  total_distance: string;
  estimated_time: string;
}

export default function NavigateScreen() {
  const { speak } = useVoice();
  const { isDemoMode } = useDemo();

  const [isNavigating, setIsNavigating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<DemoRoute | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  /** Start a demo navigation session */
  const startDemoNavigation = useCallback(async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setIsLoading(true);
    speak('Calculating route to Room 3', { instant: true });

    // Simulate route calculation delay
    await new Promise((r) => setTimeout(r, 1500));

    const route = getDemoDirections() as DemoRoute;
    setCurrentRoute(route);
    setCurrentStepIdx(0);
    setIsNavigating(true);
    setIsLoading(false);

    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    speak(
      `Route found to ${route.destination}. Total distance: ${route.total_distance}. Estimated time: ${route.estimated_time}. First step: ${route.steps[0].instruction}`,
      { instant: false },
    );
  }, [speak]);

  /** Announce the next navigation step */
  const nextStep = useCallback(async () => {
    if (!currentRoute) return;

    const nextIdx = currentStepIdx + 1;
    if (nextIdx >= currentRoute.steps.length) {
      // Arrived
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      speak(`You have arrived at ${currentRoute.destination}.`, { instant: false });
      setIsNavigating(false);
      return;
    }

    setCurrentStepIdx(nextIdx);
    const step = currentRoute.steps[nextIdx];
    // Different haptic for direction changes
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
    speak(`Step ${nextIdx + 1}: ${step.instruction}`, { instant: false });
  }, [currentRoute, currentStepIdx, speak]);

  /** Stop navigation */
  const stopNavigation = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setIsNavigating(false);
    setCurrentRoute(null);
    setCurrentStepIdx(0);
    speak('Navigation stopped', { instant: true });
  }, [speak]);

  return (
    <ScreenContainer
      title="Indoor Navigation"
      subtitle="Voice-guided navigation using ArUco markers to help you move safely through indoor spaces."
    >
      {/* Demo mode banner */}
      {isDemoMode && (
        <View
          style={styles.demoBanner}
          accessibilityLabel="Demo mode is active. Navigation is simulated."
        >
          <Text style={styles.demoBannerText}>🎭 Demo Mode — simulated route</Text>
        </View>
      )}

      {/* Status cards */}
      <View style={styles.statusSection}>
        {isDemoMode ? (
          <StatusCard
            icon="✅"
            title="Status"
            statusText="Demo mode — simulated navigation ready"
            variant="success"
          />
        ) : (
          <StatusCard
            icon="🔧"
            title="Status"
            statusText="Backend stub — navigation API implementation in progress"
            variant="warning"
          />
        )}
        <StatusCard
          icon="📌"
          title="Technology"
          statusText="ArUco marker detection with path-finding algorithms"
          variant="info"
        />
      </View>

      {/* Active navigation: route steps */}
      {isNavigating && currentRoute && (
        <View style={styles.routeCard}>
          <Text style={styles.routeTitle} accessibilityRole="header">
            🧭 Navigating to {currentRoute.destination}
          </Text>
          <Text style={styles.routeSubtitle}>
            {currentRoute.total_distance} · {currentRoute.estimated_time}
          </Text>

          {/* Steps list */}
          {currentRoute.steps.map((step, idx) => (
            <View
              key={idx}
              style={[
                styles.routeStep,
                idx === currentStepIdx && styles.routeStepActive,
                idx < currentStepIdx && styles.routeStepDone,
              ]}
              accessibilityLabel={`Step ${idx + 1}: ${step.instruction}. ${idx === currentStepIdx ? 'Current step' : idx < currentStepIdx ? 'Completed' : 'Upcoming'}`}
            >
              <View style={[
                styles.stepCircle,
                idx === currentStepIdx && styles.stepCircleActive,
                idx < currentStepIdx && styles.stepCircleDone,
              ]}>
                <Text style={styles.stepCircleText}>
                  {idx < currentStepIdx ? '✓' : idx + 1}
                </Text>
              </View>
              <View style={styles.stepTextBlock}>
                <Text style={[
                  styles.stepInstruction,
                  idx === currentStepIdx && styles.stepInstructionActive,
                ]}>
                  {step.instruction}
                </Text>
                <Text style={styles.stepDistance}>{step.distance}</Text>
              </View>
            </View>
          ))}

          {/* Navigation controls */}
          <View style={styles.navControls}>
            <AccessibleButton
              label={currentStepIdx >= currentRoute.steps.length - 1 ? 'Finish' : 'Next Step'}
              accessibilityHint="Announces the next navigation instruction with haptic feedback"
              variant="large"
              icon="➡️"
              onPress={nextStep}
            />
            <AccessibleButton
              label="Stop Navigation"
              accessibilityHint="Cancels the current navigation session"
              variant="outline"
              icon="⏹️"
              onPress={stopNavigation}
            />
          </View>
        </View>
      )}

      {/* Loading state */}
      {isLoading && (
        <View
          style={styles.loadingCard}
          accessibilityRole="progressbar"
          accessibilityLabel="Calculating route, please wait"
        >
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Calculating route...</Text>
        </View>
      )}

      {/* How it works (shown when not navigating) */}
      {!isNavigating && !isLoading && (
        <View style={styles.featureList}>
          <Text style={styles.featureTitle} accessibilityRole="header">
            How indoor navigation works
          </Text>

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepLabel}>Scan a Marker</Text>
              <Text style={styles.stepDesc}>
                Point your camera at an ArUco marker to determine your current position
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepLabel}>Tell Rafiq Where to Go</Text>
              <Text style={styles.stepDesc}>
                Say your destination like "Take me to Room 101" or "Find the elevator"
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepLabel}>Follow Voice Instructions</Text>
              <Text style={styles.stepDesc}>
                Rafiq guides you step-by-step with spoken directions and haptic feedback
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Action */}
      {!isNavigating && !isLoading && (
        <View style={styles.actionSection}>
          <AccessibleButton
            label="Start Navigation"
            accessibilityHint={
              isDemoMode
                ? 'Starts a simulated navigation to Room 3 with step-by-step voice instructions'
                : 'This feature is coming soon and not yet available'
            }
            variant="large"
            icon="🧭"
            disabled={!isDemoMode}
            onPress={startDemoNavigation}
          />
          {!isDemoMode && (
            <Text style={styles.comingSoon}>
              Enable demo mode in Settings to try simulated navigation
            </Text>
          )}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  statusSection: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  demoBanner: {
    backgroundColor: Colors.warningLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  demoBannerText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.warning,
  },
  routeCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  routeTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  routeSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  routeStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    opacity: 0.5,
  },
  routeStepActive: {
    backgroundColor: Colors.accentGlow,
    opacity: 1,
  },
  routeStepDone: {
    opacity: 0.7,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.backgroundInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: Colors.accent,
  },
  stepCircleDone: {
    backgroundColor: Colors.success,
  },
  stepCircleText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  stepTextBlock: {
    flex: 1,
    gap: 2,
  },
  stepInstruction: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  stepInstructionActive: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  stepDistance: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  navControls: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  loadingCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  featureList: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  featureTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumberText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  stepContent: {
    flex: 1,
    gap: 2,
  },
  stepLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  stepDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: FontSize.sm * 1.4,
  },
  actionSection: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  comingSoon: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
