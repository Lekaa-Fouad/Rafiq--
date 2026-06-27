/**
 * src/components/StatusBadge.tsx
 * Shows backend connectivity status (online/offline + Whisper loaded).
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { FontSize, FontWeight } from '../constants/typography';
import { checkHealth } from '../api/health';

export function StatusBadge() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [whisperLoaded, setWhisperLoaded] = useState(false);

  const check = async () => {
    setStatus('checking');
    try {
      const result = await checkHealth();
      if (result.success && result.data?.status === 'ok') {
        setStatus('online');
        setWhisperLoaded(result.data.whisper_loaded);
      } else {
        setStatus('offline');
      }
    } catch {
      setStatus('offline');
    }
  };

  useEffect(() => {
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  const config = {
    checking: { color: Colors.warning, label: 'Connecting…', dot: '⏳' },
    online: {
      color: whisperLoaded ? Colors.success : Colors.warning,
      label: whisperLoaded ? 'Backend Online' : 'Online (Loading AI…)',
      dot: whisperLoaded ? '🟢' : '🟡',
    },
    offline: { color: Colors.error, label: 'Backend Offline', dot: '🔴' },
  }[status];

  return (
    <TouchableOpacity
      onPress={check}
      style={[styles.badge, { borderColor: config.color }]}
      accessibilityRole="button"
      accessibilityLabel={`Server status: ${config.label}. Tap to refresh.`}
    >
      <Text style={styles.dot} accessibilityElementsHidden>{config.dot}</Text>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignSelf: 'center',
  },
  dot: {
    fontSize: 10,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});
