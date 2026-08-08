import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';

export interface CardCameraHandle {
  capture(): Promise<string | null>;
}

export interface CardCameraProps {
  style?: object;
}

/**
 * Web stand-in. Importing expo-camera here would make the browser fetch a QR
 * decoder from a CDN on load — an external dependency this app has no use for.
 * On desktop the "choose a photo" path covers the same job.
 */
export const CardCamera = forwardRef<CardCameraHandle, CardCameraProps>(function CardCamera(
  { style },
  _ref,
) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.text}>Live camera capture is not available in the browser.</Text>
      <Text style={styles.hint}>Use “Choose a photo” instead.</Text>
    </View>
  );
});

/** Mirrors expo-camera's hook shape so callers need no platform branching. */
export function useCameraPermissions(): [
  { granted: boolean } | null,
  () => Promise<{ granted: boolean }>,
] {
  return [{ granted: false }, async () => ({ granted: false })];
}

export const cameraSupported = false;

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  text: { color: colors.text, fontSize: 15, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 13 },
});
