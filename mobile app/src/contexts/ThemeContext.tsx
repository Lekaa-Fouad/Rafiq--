/**
 * src/contexts/ThemeContext.tsx
 * Provides centralized theme access and dark/light mode toggling.
 * Default: dark mode (better for low-vision users and presentation screenshots).
 */

import React, { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Colors, Spacing, BorderRadius, TouchTargets, Shadows } from '../constants/theme';
import { FontSize, FontWeight, FontFamily, LineHeight } from '../constants/typography';

interface ThemeContextValue {
  /** Whether dark mode is active */
  isDarkMode: boolean;
  /** Toggle between dark/light mode */
  toggleTheme: () => void;
  /** Color palette (currently only dark mode) */
  colors: typeof Colors;
  /** Spacing scale */
  spacing: typeof Spacing;
  /** Border radius scale */
  borderRadius: typeof BorderRadius;
  /** Touch target sizes */
  touchTargets: typeof TouchTargets;
  /** Shadow presets */
  shadows: typeof Shadows;
  /** Font sizes */
  fontSize: typeof FontSize;
  /** Font weights */
  fontWeight: typeof FontWeight;
  /** Font families */
  fontFamily: typeof FontFamily;
  /** Line height multipliers */
  lineHeight: typeof LineHeight;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [isDarkMode, setIsDarkMode] = useState(true);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => !prev);
    // Future: swap color palette for light mode
  }, []);

  const value: ThemeContextValue = {
    isDarkMode,
    toggleTheme,
    colors: Colors,
    spacing: Spacing,
    borderRadius: BorderRadius,
    touchTargets: TouchTargets,
    shadows: Shadows,
    fontSize: FontSize,
    fontWeight: FontWeight,
    fontFamily: FontFamily,
    lineHeight: LineHeight,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to consume theme values. Throws if used outside ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
