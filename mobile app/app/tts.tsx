/**
 * app/tts.tsx — Text-to-Speech Screen
 *
 * Fully functional: types/pastes text → sends to POST /voice/tts → plays MP3.
 * Verified against backend/routers/voice.py.
 */

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

import { useTextToSpeech } from '../src/hooks/useTextToSpeech';
import { useHaptics } from '../src/hooks/useHaptics';
import { Colors, Spacing, BorderRadius, TouchTargets } from '../src/constants/theme';
import { FontSize, FontWeight } from '../src/constants/typography';

const QUICK_PHRASES = [
  { label: 'Help', text: 'Hello, I need some help please.' },
  { label: 'Thank you', text: 'Thank you very much.' },
  { label: 'مرحبا', text: 'مرحبا، كيف يمكنني المساعدة؟' },
  { label: 'شكراً', text: 'شكراً جزيلاً.' },
];

const VOICES = [
  { label: 'Auto', value: undefined },
  { label: '🇺🇸 Jenny (EN)', value: 'en-US-JennyNeural' },
  { label: '🇸🇦 Zariyah (AR)', value: 'ar-SA-ZariyahNeural' },
  { label: '🇬🇧 Libby (EN)', value: 'en-GB-LibbyNeural' },
];

export default function TTSScreen() {
  const haptics = useHaptics();
  const { speak, stop, ttsState, isPlaying, isLoading, error } = useTextToSpeech();

  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string | undefined>(undefined);

  const handleSpeak = useCallback(async () => {
    if (!text.trim()) {
      await speak('Please type some text first.');
      return;
    }
    await haptics.startAction();
    await speak(text.trim(), { voice: selectedVoice });
  }, [text, selectedVoice, speak, haptics]);

  const handleStop = useCallback(async () => {
    await haptics.tap();
    stop();
  }, [stop, haptics]);

  const charCount = text.length;
  const maxChars = 2000;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.description}>
          Type text below and tap Speak. The backend will synthesise it using Microsoft Edge-TTS.
        </Text>

        {/* Voice picker */}
        <Text style={styles.sectionLabel}>Voice</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.voiceRow}>
          {VOICES.map((v) => {
            const isSelected = selectedVoice === v.value;
            return (
              <TouchableOpacity
                key={v.label}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => { setSelectedVoice(v.value); haptics.tap(); }}
                accessibilityRole="radio"
                accessibilityLabel={v.label}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Quick phrases */}
        <Text style={styles.sectionLabel}>Quick phrases</Text>
        <View style={styles.phrasesGrid}>
          {QUICK_PHRASES.map((p) => (
            <TouchableOpacity
              key={p.label}
              style={styles.phraseChip}
              onPress={() => { setText(p.text); haptics.tap(); }}
              accessibilityRole="button"
              accessibilityLabel={`Quick phrase: ${p.text}`}
            >
              <Text style={styles.phraseLabel}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Text Input */}
        <Text style={styles.sectionLabel}>Text to speak</Text>
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          placeholder="Type or paste text here…"
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={maxChars}
          accessibilityLabel="Text input for speech synthesis"
          accessibilityHint="Type the text you want Rafiq to speak"
          returnKeyType="default"
        />
        <Text style={[styles.charCount, charCount > maxChars * 0.9 && styles.charCountWarn]}>
          {charCount} / {maxChars}
        </Text>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          {isPlaying || isLoading ? (
            <TouchableOpacity
              style={[styles.button, styles.stopButton]}
              onPress={handleStop}
              accessibilityRole="button"
              accessibilityLabel="Stop speaking"
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.textPrimary} />
              ) : (
                <Text style={styles.buttonText}>⏹ Stop</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.speakButton, !text.trim() && styles.buttonDisabled]}
              onPress={handleSpeak}
              disabled={!text.trim()}
              accessibilityRole="button"
              accessibilityLabel={text.trim() ? 'Speak the typed text' : 'Enter text first to speak'}
              accessibilityState={{ disabled: !text.trim() }}
            >
              <Text style={styles.buttonText}>🔊 Speak</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={() => { setText(''); haptics.tap(); }}
            accessibilityRole="button"
            accessibilityLabel="Clear the text"
          >
            <Text style={[styles.buttonText, { color: Colors.textSecondary }]}>✕ Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  description: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: FontSize.md * 1.6,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  voiceRow: { marginBottom: Spacing.md },
  chip: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginRight: Spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: Colors.accentGlow,
    borderColor: Colors.accent,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  chipTextSelected: { color: Colors.accent },
  phrasesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  phraseChip: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: TouchTargets.minimum,
    justifyContent: 'center',
  },
  phraseLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  textInput: {
    backgroundColor: Colors.backgroundInput,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    lineHeight: FontSize.lg * 1.6,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  charCount: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  charCountWarn: { color: Colors.warning },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  button: {
    flex: 1,
    minHeight: TouchTargets.minimum,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  speakButton: { backgroundColor: Colors.accent },
  stopButton: { backgroundColor: Colors.error },
  clearButton: {
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  errorCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
  },
});
