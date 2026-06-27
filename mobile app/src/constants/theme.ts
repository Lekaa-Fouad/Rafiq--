/**
 * src/constants/theme.ts
 * Design system for Rafiq — high-contrast, accessibility-first dark theme.
 *
 * Color choices:
 * - Deep navy background (#0D1117) — zero eye strain, WCAG AAA on white text
 * - Electric indigo (#6366F1) — strong, distinctive accent
 * - Warm white (#F0F6FC) — softer than pure white, easier on low vision
 * - Semantic colors for states: success, error, warning
 */

export const Colors = {
  // Backgrounds
  background: '#0D1117',
  backgroundCard: '#161B22',
  backgroundElevated: '#1C2333',
  backgroundInput: '#21262D',

  // Accent
  accent: '#6366F1',          // Electric indigo — primary actions
  accentLight: '#818CF8',     // Lighter shade for pressed states
  accentDark: '#4F46E5',      // Darker for active/selected
  accentGlow: 'rgba(99, 102, 241, 0.25)',  // Glow/shadow

  // Text
  textPrimary: '#F0F6FC',     // Near-white — main readable content
  textSecondary: '#8B949E',   // Muted — labels, captions
  textMuted: '#484F58',       // Very muted — placeholders

  // Semantic
  success: '#3FB950',         // Green
  successLight: 'rgba(63, 185, 80, 0.15)',
  error: '#F85149',           // Red
  errorLight: 'rgba(248, 81, 73, 0.15)',
  warning: '#E3B341',         // Amber
  warningLight: 'rgba(227, 179, 65, 0.15)',

  // Borders
  border: '#30363D',
  borderFocus: '#6366F1',

  // Mic button states
  micIdle: '#6366F1',
  micListening: '#F85149',    // Red while recording — clear visual state
  micProcessing: '#E3B341',   // Amber while waiting for response

  // Tab bar
  tabBarBackground: '#0A0E14',   // Slightly darker than main bg for layering
  tabBarActive: '#6366F1',       // Accent for selected tab
  tabBarInactive: '#484F58',     // Muted for unselected tabs
  tabBarBorder: '#1C2333',       // Subtle top border

  // Transparent overlays
  overlay: 'rgba(13, 17, 23, 0.85)',
  overlayLight: 'rgba(13, 17, 23, 0.5)',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const TouchTargets = {
  minimum: 64,   // 64x64pt — accessibility-first minimum (spec requirement)
  large: 80,     // Primary action buttons (full-width)
  hero: 120,     // Main mic button
} as const;

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  accent: {
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
} as const;
