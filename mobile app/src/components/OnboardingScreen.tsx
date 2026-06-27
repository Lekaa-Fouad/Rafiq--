/**
 * src/components/OnboardingScreen.tsx
 *
 * A one-time onboarding flow shown on first launch.
 * 3 swipeable/tappable pages, each fully voiced via expo-speech.
 * Press "Next" or "Get Started" to advance.
 *
 * Pages:
 *   1. Welcome — explains what Rafiq is
 *   2. Voice Button — how to interact (hold to talk)
 *   3. Features — quick overview of detection, faces, navigation
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { AccessibleButton } from './AccessibleButton';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { FontSize, FontWeight } from '../constants/typography';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingPage {
  emoji: string;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  voiceText: string;
}

const PAGES: OnboardingPage[] = [
  {
    emoji: '👋',
    title: 'Welcome to Rafiq',
    titleAr: 'مرحباً بك في رفيق',
    body: 'Rafiq is your AI-powered accessibility assistant. It uses camera, voice, and AI to help you understand and navigate the world around you.',
    bodyAr: 'رفيق هو مساعدك الذكي للوصول. يستخدم الكاميرا والصوت والذكاء الاصطناعي لمساعدتك في فهم بيئتك والتنقل فيها.',
    voiceText:
      'Welcome to Rafiq, your AI-powered accessibility assistant. I use camera, voice, and artificial intelligence to help you understand and navigate the world around you.',
  },
  {
    emoji: '🎙️',
    title: 'Voice-First Control',
    titleAr: 'تحكم بالصوت',
    body: 'Hold the large microphone button and speak naturally. Rafiq understands both English and Arabic commands — like "What\'s in front of me?" or "إيه قدامي".',
    bodyAr: 'اضغط مع الاستمرار على زر الميكروفون الكبير وتحدث بشكل طبيعي. رفيق يفهم أوامر الإنجليزية والعربية.',
    voiceText:
      'Control Rafiq with your voice. Hold the large microphone button and speak naturally. I understand both English and Arabic commands. Try saying "What is in front of me" or "Who is this person".',
  },
  {
    emoji: '✨',
    title: 'Ready to Go',
    titleAr: 'جاهز للبدء',
    body: 'You can detect objects, identify faces, navigate indoors, and read text — all by voice. Let\'s get started!',
    bodyAr: 'يمكنك اكتشاف الأجسام، والتعرف على الوجوه، والتنقل في الأماكن المغلقة، وقراءة النصوص — كل ذلك بالصوت.',
    voiceText:
      'You are all set. You can detect objects, identify faces, navigate indoors, and read text — all by voice. Tap Get Started when you are ready.',
  },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasSpokenRef = useRef(false);

  /** Speak the current page's voice text */
  const speakPage = useCallback((pageIndex: number) => {
    const page = PAGES[pageIndex];
    if (!page) return;
    Speech.stop().then(() => {
      Speech.speak(page.voiceText, { language: 'en-US', rate: 0.9 });
    });
  }, []);

  // Speak page 0 on mount
  useEffect(() => {
    if (!hasSpokenRef.current) {
      hasSpokenRef.current = true;
      // Short delay so the screen renders first
      const timer = setTimeout(() => speakPage(0), 600);
      return () => clearTimeout(timer);
    }
  }, [speakPage]);

  /** Handle scroll to detect page changes */
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const page = Math.round(offsetX / SCREEN_WIDTH);
      if (page !== currentPage && page >= 0 && page < PAGES.length) {
        setCurrentPage(page);
        speakPage(page);
      }
    },
    [currentPage, speakPage],
  );

  /** Navigate to next page or complete onboarding */
  const handleNext = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    if (currentPage < PAGES.length - 1) {
      const nextPage = currentPage + 1;
      scrollViewRef.current?.scrollTo({ x: nextPage * SCREEN_WIDTH, animated: true });
      setCurrentPage(nextPage);
      speakPage(nextPage);
    } else {
      Speech.stop();
      onComplete();
    }
  }, [currentPage, onComplete, speakPage]);

  /** Skip onboarding entirely */
  const handleSkip = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    Speech.stop();
    onComplete();
  }, [onComplete]);

  const isLastPage = currentPage === PAGES.length - 1;
  const page = PAGES[currentPage];

  return (
    <View style={styles.container}>
      {/* ── Skip Button ─────────────────────────────────── */}
      <AccessibleButton
        label="Skip"
        accessibilityLabel="Skip onboarding"
        variant="ghost"
        onPress={handleSkip}
        style={styles.skipButton}
      />

      {/* ── Swipeable Pages ─────────────────────────────── */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.scrollArea}
        accessibilityLabel={`Onboarding page ${currentPage + 1} of ${PAGES.length}`}
      >
        {PAGES.map((p, i) => (
          <View key={i} style={styles.page}>
            <Text style={styles.emoji} accessibilityElementsHidden>
              {p.emoji}
            </Text>
            <Text
              style={styles.title}
              accessibilityRole="header"
            >
              {p.title}
            </Text>
            <Text style={styles.titleAr} accessibilityElementsHidden>
              {p.titleAr}
            </Text>
            <Text style={styles.body}>{p.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* ── Page Indicators ─────────────────────────────── */}
      <View
        style={styles.dots}
        accessibilityLabel={`Page ${currentPage + 1} of ${PAGES.length}`}
        accessibilityRole="adjustable"
      >
        {PAGES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === currentPage && styles.dotActive]}
            accessibilityElementsHidden
          />
        ))}
      </View>

      {/* ── Next / Get Started Button ───────────────────── */}
      <View style={styles.bottomArea}>
        <AccessibleButton
          label={isLastPage ? 'Get Started ✨' : 'Next →'}
          accessibilityLabel={
            isLastPage
              ? 'Get started, finish onboarding'
              : `Go to onboarding page ${currentPage + 2}`
          }
          variant="large"
          onPress={handleNext}
          style={styles.nextButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: Spacing.lg,
    zIndex: 10,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
  },
  scrollArea: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  emoji: {
    fontSize: 72,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  titleAr: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  body: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.md * 1.6,
    maxWidth: 340,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textMuted,
  },
  dotActive: {
    backgroundColor: Colors.accent,
    width: 24,
  },
  bottomArea: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 60,
  },
  nextButton: {
    width: '100%',
  },
});