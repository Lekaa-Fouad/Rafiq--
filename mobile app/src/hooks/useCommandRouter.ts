/**
 * src/hooks/useCommandRouter.ts
 * Parses STT transcripts and routes to the appropriate feature screen.
 *
 * Voice command keywords (Arabic + English):
 *   OCR:        "read", "text", "scan", "اقرأ", "نص"
 *   Face:       "face", "who", "identify", "وجه", "من"
 *   Detection:  "detect", "object", "what", "obstacle", "كشف", "ماذا"
 *   Navigate:   "navigate", "go", "where", "direction", "تنقل", "اذهب"
 *   TTS:        "say", "speak", "tell me", "قل", "اخبرني"
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';

export type RouteTarget = 'ocr' | 'face' | 'detect' | 'navigate' | 'tts' | 'home' | null;

const KEYWORD_MAP: Record<RouteTarget & string, string[]> = {
  home: ['home', 'main', 'dashboard', 'الرئيسية', 'البداية'],
  ocr: ['read', 'text', 'scan', 'ocr', 'اقرأ', 'نص', 'مسح'],
  face: ['face', 'who', 'identify', 'recognize', 'person', 'وجه', 'من', 'عرف'],
  detect: ['detect', 'object', 'what', 'obstacle', 'see', 'كشف', 'ماذا', 'اكتشف'],
  navigate: ['navigate', 'go', 'direction', 'where', 'walk', 'تنقل', 'اذهب', 'اتجاه'],
  tts: ['say', 'speak', 'tell', 'repeat', 'قل', 'اخبر', 'كرر'],
};

function detectRoute(transcript: string): RouteTarget {
  const lower = transcript.toLowerCase();

  for (const [route, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return route as RouteTarget;
    }
  }
  return null;
}

export function useCommandRouter() {
  const router = useRouter();

  const routeFromTranscript = useCallback(
    (transcript: string): RouteTarget => {
      const target = detectRoute(transcript);

      if (target && target !== 'home') {
        router.push(`/${target}` as any);
      }

      return target;
    },
    [router]
  );

  return { routeFromTranscript };
}
