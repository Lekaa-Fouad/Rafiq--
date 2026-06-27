/**
 * src/hooks/useHaptics.ts
 * Consistent haptic feedback patterns throughout the app.
 * Wraps expo-haptics with named semantic actions.
 */

import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';

export function useHaptics() {
  /** Light tap — for UI interactions, navigation */
  const tap = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics not supported (simulator/web) — silent fail
    }
  }, []);

  /** Medium impact — for starting recording */
  const startAction = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  }, []);

  /** Heavy impact — for completing/submitting */
  const completeAction = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
  }, []);

  /** Success notification pattern */
  const success = useCallback(async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }, []);

  /** Error notification pattern */
  const error = useCallback(async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}
  }, []);

  /** Warning notification pattern */
  const warning = useCallback(async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
  }, []);

  return { tap, startAction, completeAction, success, error, warning };
}
