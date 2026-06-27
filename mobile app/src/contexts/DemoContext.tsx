/**
 * src/contexts/DemoContext.tsx
 *
 * Provides a "demo mode" toggle that disables real mic/camera permission prompts
 * and simulates responses. Persisted to AsyncStorage so it survives restarts.
 *
 * Usage:
 *   const { isDemoMode, toggleDemoMode } = useDemo();
 *
 * When demo mode is active, consumers should:
 *   - Skip camera permission requests
 *   - Return simulated transcription results
 *   - Return mock detection / face / navigation data
 *   - Never trigger real API calls
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

const DEMO_MODE_KEY = 'rafiq_demo_mode';

interface DemoContextValue {
  /** Whether demo mode is currently active */
  isDemoMode: boolean;
  /** Toggle demo mode on/off (persists to AsyncStorage) */
  toggleDemoMode: () => void;
  /** Force demo mode on (for initial setup) */
  enableDemoMode: () => void;
  /** Force demo mode off */
  disableDemoMode: () => void;
}

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

interface DemoProviderProps {
  children: ReactNode;
}

export function DemoProvider({ children }: DemoProviderProps) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load persisted value on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(DEMO_MODE_KEY);
        if (stored === 'true') {
          setIsDemoMode(true);
        }
      } catch {
        // AsyncStorage read failed — default to off
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  // Persist whenever it changes
  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(DEMO_MODE_KEY, isDemoMode ? 'true' : 'false').catch(() => {});
  }, [isDemoMode, isLoaded]);

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode((prev) => !prev);
  }, []);

  const enableDemoMode = useCallback(() => {
    setIsDemoMode(true);
  }, []);

  const disableDemoMode = useCallback(() => {
    setIsDemoMode(false);
  }, []);

  const value: DemoContextValue = {
    isDemoMode,
    toggleDemoMode,
    enableDemoMode,
    disableDemoMode,
  };

  return (
    <DemoContext.Provider value={value}>
      {children}
    </DemoContext.Provider>
  );
}

/**
 * Hook to consume demo mode state. Throws if used outside DemoProvider.
 */
export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return ctx;
}

// ── Simulated Responses ──────────────────────────────────────────────────────
// These are used by consumers when isDemoMode === true

/** Simulated transcription text for demo purposes */
export function getDemoTranscript(): string {
  const demos = [
    "What's in front of me",
    "Who is this person",
    "Take me to room 3",
    "Read this text",
    "Describe surroundings",
  ];
  return demos[Math.floor(Math.random() * demos.length)];
}

/** Simulated detection results for demo — matches DetectionObject type */
export function getDemoDetections() {
  return [
    {
      object_id: 1,
      object_name: 'chair',
      confidence: 0.92,
      direction: 'in front of you',
      distance_m: 2.3,
      distance: 'medium distance',
      motion: 'static',
      speech: 'Chair, 2.3 meters in front of you',
      bbox: [100, 200, 300, 400] as [number, number, number, number],
    },
    {
      object_id: 2,
      object_name: 'table',
      confidence: 0.87,
      direction: 'on your right',
      distance_m: 1.8,
      distance: 'close',
      motion: 'static',
      speech: 'Table, 1.8 meters to your right',
      bbox: [400, 150, 600, 350] as [number, number, number, number],
    },
  ];
}

/** Simulated face identification result for demo */
export function getDemoFaceResult() {
  return {
    name: 'Demo Person',
    confidence: 0.95,
    message: 'This is Demo Person. They are a colleague.',
  };
}

/** Simulated navigation directions for demo */
export function getDemoDirections() {
  return {
    destination: 'Room 3',
    steps: [
      { instruction: 'Walk forward 3 meters', direction: 'forward', distance: '3m' },
      { instruction: 'Turn right at the hallway', direction: 'right', distance: '1m' },
      { instruction: 'Room 3 will be on your left', direction: 'left', distance: '2m' },
    ],
    total_distance: '6 meters',
    estimated_time: '30 seconds',
  };
}