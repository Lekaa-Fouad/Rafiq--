/**
 * src/contexts/OnboardingContext.tsx
 *
 * Tracks whether the user has completed the one-time onboarding flow.
 * Persists to AsyncStorage so it only shows once.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'rafiq_onboarding_complete';

interface OnboardingContextValue {
  /** Whether onboarding has been completed */
  isOnboardingComplete: boolean;
  /** Whether we've finished loading the persisted value */
  isLoaded: boolean;
  /** Mark onboarding as done (persists) */
  completeOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (stored === 'true') {
          setIsOnboardingComplete(true);
        }
      } catch {
        // Default to showing onboarding
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const completeOnboarding = useCallback(() => {
    setIsOnboardingComplete(true);
    AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
  }, []);

  return (
    <OnboardingContext.Provider
      value={{ isOnboardingComplete, isLoaded, completeOnboarding }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return ctx;
}