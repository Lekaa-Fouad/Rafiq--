/**
 * app/(tabs)/faces.tsx — Face Management
 *
 * Full face registration + identification flow:
 *   - List of registered faces as accessible rows
 *   - "Register New Face" — opens camera, prompts for name, calls faceService
 *   - "Identify Face" — opens camera, calls identifyFace, speaks result
 *   - Delete support per face row
 *
 * Phase 5: demo mode (simulated face results), haptic feedback on all actions,
 * loading state with spoken feedback for blind users.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { AccessibleButton } from '../../src/components/AccessibleButton';
import { useVoice } from '../../src/contexts/VoiceContext';
import { useDemo, getDemoFaceResult } from '../../src/contexts/DemoContext';
import { registerFace, identifyFace, listFaces, deleteFace } from '../../src/services/faceService';
import type { FaceListItem } from '../../src/types/face';
import { Colors, Spacing, BorderRadius, TouchTargets } from '../../src/constants/theme';
import { FontSize, FontWeight } from '../../src/constants/typography';

// ── Demo data ────────────────────────────────────────────────────────────────

const DEMO_FACES: FaceListItem[] = [
  {
    face_id: 'demo-1',
    name: 'Ahmed Hassan',
    image_count: 3,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    face_id: 'demo-2',
    name: 'Sara Ali',
    image_count: 2,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    face_id: 'demo-3',
    name: 'Dr. Mohamed',
    image_count: 1,
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
];

export default function FacesScreen() {
  // ── Context ───────────────────────────────────────────────────────────
  const { speak } = useVoice();
  const { isDemoMode } = useDemo();

  // ── Face list state ───────────────────────────────────────────────────
  const [faces, setFaces] = useState<FaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Camera modal state ────────────────────────────────────────────────
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'register' | 'identify'>('register');
  const [identifyResult, setIdentifyResult] = useState<{
    name: string;
    confidence: number;
    identified: boolean;
  } | null>(null);

  // ── Load face list ────────────────────────────────────────────────────
  const loadFaces = useCallback(async () => {
    try {
      setLoading(true);
      if (isDemoMode) {
        // Simulate a short network delay
        await new Promise((r) => setTimeout(r, 600));
        setFaces(DEMO_FACES);
      } else {
        const list = await listFaces();
        setFaces(list);
      }
    } catch {
      // Silently fail — list is decorative for now
    } finally {
      setLoading(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    loadFaces();
  }, [loadFaces]);

  // ── Delete face ───────────────────────────────────────────────────────
  const handleDelete = useCallback(
    (face: FaceListItem) => {
      Alert.alert(
        'Delete Face',
        `Remove "${face.name}" from registered faces?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setActionLoading(true);
                try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                speak(`Deleting ${face.name}`, { instant: true });

                if (isDemoMode) {
                  await new Promise((r) => setTimeout(r, 500));
                  setFaces((prev) => prev.filter((f) => f.face_id !== face.face_id));
                } else {
                  await deleteFace(face.face_id);
                  await loadFaces();
                }

                try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                speak(`${face.name} has been removed`, { instant: true });
              } catch {
                try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
                speak('Failed to delete face', { instant: true });
              } finally {
                setActionLoading(false);
              }
            },
          },
        ],
      );
    },
    [isDemoMode, loadFaces, speak],
  );

  // ── Open camera via ImagePicker ───────────────────────────────────────
  const openCamera = useCallback(
    async (mode: 'register' | 'identify') => {
      setCameraMode(mode);
      setIdentifyResult(null);

      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      speak(mode === 'register' ? 'Opening camera to register a face' : 'Opening camera to identify', { instant: true });

      if (isDemoMode) {
        // Skip actual camera in demo mode
        if (mode === 'register') {
          setCapturedUri('demo://photo');
          setShowNamePrompt(true);
        } else {
          await performIdentifyDemo();
        }
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
      });

      if (result.canceled || result.assets.length === 0) return;

      const uri = result.assets[0].uri;
      setCapturedUri(uri);

      if (mode === 'register') {
        setShowNamePrompt(true);
      } else {
        await performIdentify(uri);
      }
    },
    [isDemoMode, speak],
  );

  // ── Register face ─────────────────────────────────────────────────────
  const performRegister = useCallback(
    async (name: string) => {
      if (!capturedUri || !name.trim()) return;
      try {
        setActionLoading(true);
        setShowNamePrompt(false);
        speak(`Registering ${name.trim()}`, { instant: true });

        if (isDemoMode) {
          await new Promise((r) => setTimeout(r, 800));
          const newFace: FaceListItem = {
            face_id: `demo-${Date.now()}`,
            name: name.trim(),
            image_count: 1,
            created_at: new Date().toISOString(),
          };
          setFaces((prev) => [newFace, ...prev]);
          try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          speak(`Registered ${name.trim()} successfully`, { instant: true });
        } else {
          const result = await registerFace(capturedUri, name.trim());
          try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          speak(result.message || `Registered ${name.trim()} successfully`, { instant: true });
          await loadFaces();
        }

        setNameInput('');
        setCapturedUri(null);
      } catch {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        speak('Failed to register face. Please try again.', { instant: true });
      } finally {
        setActionLoading(false);
      }
    },
    [capturedUri, isDemoMode, loadFaces, speak],
  );

  // ── Identify face (live) ──────────────────────────────────────────────
  const performIdentify = useCallback(
    async (uri: string) => {
      try {
        setActionLoading(true);
        speak('Analyzing face', { instant: true });
        const result = await identifyFace(uri);

        if (result.identified && result.name) {
          const confidence = Math.round(result.confidence * 100);
          const msg = `This is ${result.name}. I am ${confidence}% confident.`;
          setIdentifyResult({ name: result.name, confidence, identified: true });
          try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          speak(msg, { instant: false });
        } else {
          setIdentifyResult({ name: '', confidence: 0, identified: false });
          try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
          speak("I don't recognize this person.", { instant: false });
        }
      } catch {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        speak('Failed to identify. Please try again.', { instant: true });
      } finally {
        setActionLoading(false);
      }
    },
    [speak],
  );

  // ── Identify face (demo) ──────────────────────────────────────────────
  const performIdentifyDemo = useCallback(async () => {
    try {
      setActionLoading(true);
      speak('Analyzing face', { instant: true });
      await new Promise((r) => setTimeout(r, 1200));

      const demo = getDemoFaceResult();
      const confidence = Math.round(demo.confidence * 100);
      setIdentifyResult({ name: demo.name, confidence, identified: true });
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      speak(`This is ${demo.name}. I am ${confidence}% confident.`, { instant: false });
    } finally {
      setActionLoading(false);
    }
  }, [speak]);

  // ── Render helpers ────────────────────────────────────────────────────
  const renderFaceRow = ({ item }: { item: FaceListItem }) => (
    <View
      style={styles.faceRow}
      accessibilityRole="button"
      accessibilityLabel={`Registered face: ${item.name}. ${item.image_count} image${item.image_count !== 1 ? 's' : ''}. Created ${new Date(item.created_at).toLocaleDateString()}`}
    >
      <View style={styles.faceAvatar}>
        <Text style={styles.faceAvatarText} accessibilityElementsHidden>
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.faceInfo}>
        <Text style={styles.faceName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.faceMeta} numberOfLines={1}>
          {item.image_count} image{item.image_count !== 1 ? 's' : ''} ·{' '}
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => handleDelete(item)}
        style={styles.deleteButton}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.name}`}
        accessibilityHint={`Removes ${item.name} from registered faces`}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.deleteIcon}>🗑️</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Name prompt modal ─────────────────────────────────────────────────
  if (showNamePrompt) {
    return (
      <ScreenContainer title="Register Face">
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowNamePrompt(false);
            setCapturedUri(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View
              style={styles.namePromptCard}
              accessibilityRole="none"
            >
              <Text
                style={styles.namePromptTitle}
                accessibilityRole="header"
              >
                Who is this person?
              </Text>
              <Text style={styles.namePromptHint}>
                Enter their name below, then tap "Save".
              </Text>
              <TextInput
                style={styles.nameInput}
                placeholder="Name (e.g. Ahmed)"
                placeholderTextColor={Colors.textMuted}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (nameInput.trim()) performRegister(nameInput);
                }}
                accessibilityLabel="Enter the person's name"
                accessibilityHint="Type the name of the person you just photographed"
              />
              <View style={styles.namePromptActions}>
                <AccessibleButton
                  label="Save"
                  accessibilityHint={`Saves this face with the name ${nameInput || 'entered name'}`}
                  variant="large"
                  icon="💾"
                  onPress={() => {
                    if (nameInput.trim()) performRegister(nameInput);
                  }}
                  disabled={!nameInput.trim()}
                />
                <AccessibleButton
                  label="Cancel"
                  accessibilityHint="Closes this dialog without saving"
                  variant="outline"
                  icon="✖️"
                  onPress={() => {
                    setShowNamePrompt(false);
                    setNameInput('');
                    setCapturedUri(null);
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>
      </ScreenContainer>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────────
  return (
    <ScreenContainer
      title="Face Recognition"
      subtitle="Register faces of people you know so Rafiq can identify them."
    >
      {/* Demo mode banner */}
      {isDemoMode && (
        <View
          style={styles.demoBanner}
          accessibilityLabel="Demo mode is active. Face data is simulated."
        >
          <Text style={styles.demoBannerText}>🎭 Demo Mode — simulated data</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <AccessibleButton
          label="Register New Face"
          accessibilityHint="Opens the camera to take a photo of a new person. You will then enter their name."
          variant="large"
          icon="📸"
          onPress={() => openCamera('register')}
          disabled={actionLoading}
        />
        <AccessibleButton
          label="Identify Face"
          accessibilityHint="Opens the camera to take a photo and identify who this person is"
          variant="outline"
          icon="🔍"
          onPress={() => openCamera('identify')}
          disabled={actionLoading}
        />
      </View>

      {/* Loading overlay with spoken feedback */}
      {actionLoading && (
        <View
          style={styles.loadingOverlay}
          accessibilityRole="progressbar"
          accessibilityLabel={cameraMode === 'register' ? 'Registering face, please wait' : 'Identifying face, please wait'}
        >
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>
            {cameraMode === 'register' ? 'Registering face...' : 'Identifying...'}
          </Text>
        </View>
      )}

      {/* Identify result card */}
      {identifyResult && (
        <View
          style={[
            styles.resultCard,
            { borderColor: identifyResult.identified ? Colors.success : Colors.warning },
          ]}
          accessibilityRole="summary"
          accessibilityLabel={
            identifyResult.identified
              ? `Identified as ${identifyResult.name} with ${identifyResult.confidence}% confidence`
              : 'Person not recognized'
          }
        >
          <Text style={styles.resultIcon} accessibilityElementsHidden>
            {identifyResult.identified ? '✅' : '❓'}
          </Text>
          <View style={styles.resultInfo}>
            <Text style={styles.resultName}>
              {identifyResult.identified ? identifyResult.name : 'Not recognized'}
            </Text>
            {identifyResult.identified && (
              <Text style={styles.resultMeta}>
                {identifyResult.confidence}% confidence
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Section header */}
      <Text
        style={styles.sectionTitle}
        accessibilityRole="header"
      >
        Registered Faces ({faces.length})
      </Text>

      {/* Face list */}
      {loading ? (
        <View
          style={styles.emptyState}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading registered faces"
        >
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.emptyDesc}>Loading faces...</Text>
        </View>
      ) : faces.length === 0 ? (
        <View
          style={styles.emptyState}
          accessibilityLabel="No faces registered yet. Use the Register New Face button above to add someone."
        >
          <Text style={styles.emptyIcon} accessibilityElementsHidden>🙂</Text>
          <Text style={styles.emptyTitle}>No faces registered yet</Text>
          <Text style={styles.emptyDesc}>
            Tap "Register New Face" above to add someone. Once registered, Rafiq
            can identify them from photos or the live camera.
          </Text>
        </View>
      ) : (
        <FlatList
          data={faces}
          keyExtractor={(item) => item.face_id}
          renderItem={renderFaceRow}
          style={styles.faceList}
          contentContainerStyle={styles.faceListContent}
          scrollEnabled={false}
          accessibilityLabel={`Registered faces list. ${faces.length} people registered.`}
        />
      )}

      {/* How it works */}
      <View style={styles.infoCard}>
        <Text
          style={styles.infoTitle}
          accessibilityRole="header"
        >
          How it works
        </Text>
        <Text style={styles.infoText}>
          1. Take a clear photo of the person's face{'\n'}
          2. Enter their name{'\n'}
          3. Rafiq saves the face encoding{'\n'}
          4. Next time, point the camera — Rafiq will recognize them
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  demoBanner: {
    backgroundColor: Colors.warningLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  demoBannerText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.warning,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  faceList: {
    flex: 1,
  },
  faceListContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  faceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: TouchTargets.minimum,
    gap: Spacing.md,
  },
  faceAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceAvatarText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  faceInfo: {
    flex: 1,
    gap: 2,
  },
  faceName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  faceMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  deleteButton: {
    width: TouchTargets.minimum,
    height: TouchTargets.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  deleteIcon: {
    fontSize: 20,
  },
  emptyState: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  emptyDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.sm * 1.5,
  },
  loadingOverlay: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundElevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  resultIcon: {
    fontSize: 32,
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  resultMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  infoCard: {
    backgroundColor: Colors.backgroundElevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  infoTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
  },
  infoText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: FontSize.sm * 1.7,
  },
  // ── Name prompt modal ────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  namePromptCard: {
    backgroundColor: Colors.backgroundElevated,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: '100%',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  namePromptTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  namePromptHint: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  nameInput: {
    backgroundColor: Colors.backgroundInput,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: TouchTargets.minimum,
  },
  namePromptActions: {
    gap: Spacing.sm,
  },
});