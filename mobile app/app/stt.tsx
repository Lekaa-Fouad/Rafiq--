/**
 * app/stt.tsx — Speech-to-Text Screen
 *
 * Fully functional: records audio → sends to POST /voice/stt → displays + speaks transcript.
 * Verified against backend/routers/voice.py and backend/models/voice.py.
 */

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

import { MicButton } from '../src/components/MicButton';
import { VoiceFeedbackOverlay } from '../src/components/VoiceFeedbackOverlay';
import { ResultCard } from '../src/components/ResultCard';
import { useVoiceRecorder } from '../src/hooks/useVoiceRecorder';
import { useTextToSpeech } from '../src/hooks/useTextToSpeech';
import { useHaptics } from '../src/hooks/useHaptics';
import { transcribeAudio } from '../src/api/voice';
import { Colors, Spacing, BorderRadius } from '../src/constants/theme';
import { FontSize, FontWeight } from '../src/constants/typography';
import type { STTResponse } from '../src/types/api';

type LangFilter = 'ar' | 'en' | undefined;

export default function STTScreen() {
  const haptics = useHaptics();
  const { speak, stop, isPlaying } = useTextToSpeech();
  const { isRecording, recordingState, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [result, setResult] = useState<STTResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [langFilter, setLangFilter] = useState<LangFilter>(undefined);

  const micState = isRecording ? 'recording' : recordingState === 'processing' ? 'processing' : 'idle';

  const handlePressIn = useCallback(async () => {
    setError(null);
    await haptics.startAction();
    const ok = await startRecording();
    if (ok) {
      setOverlayVisible(true);
      await speak('Listening. Speak now.');
    } else {
      await haptics.error();
      await speak('Could not start recording. Please grant microphone permission.');
    }
  }, [haptics, startRecording, speak]);

  const handlePressOut = useCallback(async () => {
    await haptics.completeAction();
    const uri = await stopRecording();
    if (!uri) {
      setOverlayVisible(false);
      setError('No audio captured. Hold the mic longer and speak clearly.');
      await speak('No audio captured.');
      return;
    }

    try {
      const response = await transcribeAudio(uri, 'audio/m4a', langFilter);
      setOverlayVisible(false);

      if (response.success && response.data) {
        setResult(response.data);
        await haptics.success();
        // The spoken_message from backend IS the transcript
        const toSpeak = response.spoken_message || response.data.transcript || 'No speech detected.';
        await speak(toSpeak);
      } else {
        throw new Error(response.spoken_message || 'Transcription failed.');
      }
    } catch (err: any) {
      setOverlayVisible(false);
      await haptics.error();
      const msg = err?.response?.data?.spoken_message ?? err?.message ?? 'Transcription failed. Please try again.';
      setError(msg);
      await speak(msg);
    }
  }, [haptics, stopRecording, speak, langFilter]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <Text style={styles.description}>
          Hold the mic button and speak. Your speech will be transcribed by the Whisper AI model.
        </Text>

        {/* Language filter */}
        <View style={styles.langRow}>
          <Text style={styles.langLabel}>Language hint:</Text>
          {(['auto', 'en', 'ar'] as const).map((lang) => {
            const val = lang === 'auto' ? undefined : lang;
            const isSelected = langFilter === val;
            return (
              <TouchableOpacity
                key={lang}
                style={[styles.langChip, isSelected && styles.langChipSelected]}
                onPress={() => setLangFilter(val)}
                accessibilityRole="radio"
                accessibilityLabel={lang === 'auto' ? 'Auto-detect language' : lang === 'en' ? 'English' : 'Arabic'}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.langChipText, isSelected && styles.langChipTextSelected]}>
                  {lang === 'auto' ? 'Auto' : lang === 'en' ? '🇺🇸 EN' : '🇸🇦 AR'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Mic */}
        <View style={styles.micSection}>
          <MicButton
            micState={micState}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          />
        </View>

        {/* Result */}
        {result && (
          <>
            <ResultCard
              title="Transcript"
              content={result.transcript || '(no speech detected)'}
              subtitle={`Language: ${result.language.toUpperCase()} • Confidence: ${(result.confidence * 100).toFixed(0)}% • Duration: ${result.duration_seconds.toFixed(1)}s`}
              type={result.transcript ? 'success' : 'warning'}
              onSpeakAgain={() => result.transcript ? speak(result.transcript) : undefined}
              isSpeaking={isPlaying}
            />
          </>
        )}

        {/* Error */}
        {error && (
          <ResultCard
            title="Error"
            content={error}
            type="error"
            onSpeakAgain={() => speak(error)}
            isSpeaking={isPlaying}
          />
        )}
      </ScrollView>

      <VoiceFeedbackOverlay
        visible={overlayVisible}
        state={micState === 'idle' ? 'processing' : micState}
        message={isRecording ? 'Speak now…' : 'Sending to Whisper…'}
        onCancel={async () => {
          await cancelRecording();
          setOverlayVisible(false);
        }}
      />
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
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  langLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginRight: Spacing.xs,
  },
  langChip: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minHeight: 36,
    justifyContent: 'center',
  },
  langChipSelected: {
    backgroundColor: Colors.accentGlow,
    borderColor: Colors.accent,
  },
  langChipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  langChipTextSelected: {
    color: Colors.accent,
  },
  micSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
  },
});
