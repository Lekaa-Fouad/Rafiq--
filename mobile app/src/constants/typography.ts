/**
 * src/constants/typography.ts
 * Typography scale using System fonts (SF Pro on iOS, Roboto on Android).
 * Falls back gracefully without Google Fonts to avoid network dependency.
 */
import { Platform } from 'react-native';

export const FontFamily = {
  regular: Platform.select({ ios: 'System', android: 'Roboto', default: 'System' }),
  medium: Platform.select({ ios: 'System', android: 'Roboto-Medium', default: 'System' }),
  semibold: Platform.select({ ios: 'System', android: 'Roboto-Medium', default: 'System' }),
  bold: Platform.select({ ios: 'System', android: 'Roboto-Bold', default: 'System' }),
  mono: Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' }),
} as const;

export const FontSize = {
  xs: 13,
  sm: 15,
  md: 18,
  lg: 20,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  hero: 48,
} as const;

export const LineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,
};
