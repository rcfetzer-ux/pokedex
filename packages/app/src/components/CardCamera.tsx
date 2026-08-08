import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { colors, radius, spacing } from '../theme';

export interface CardCameraHandle {
  /** Base64 JPEG of the current frame, or null if capture failed. */
  capture(): Promise<string | null>;
}

export interface CardCameraProps {
  style?: object;
}

/**
 * Native camera with a card-shaped framing guide.
 *
 * Split into .tsx / .web.tsx so the web bundle never imports expo-camera at
 * all: its web build pulls a QR decoder from a CDN on load, which is a
 * pointless external request for an app that does not scan barcodes — and a
 * failing one anywhere the network is restricted.
 */
export const CardCamera = forwardRef<CardCameraHandle, CardCameraProps>(function CardCamera(
  { style },
  ref,
) {
  const cameraRef = useRef<CameraView | null>(null);

  useImperativeHandle(ref, () => ({
    async capture() {
      const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.6 });
      return photo?.base64 ?? null;
    },
  }));

  return (
    <View style={[styles.wrap, style]}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      <View pointerEvents="none" style={styles.overlay}>
        {/* Pokémon cards are 63x88mm; a framed card OCRs far better than a skewed one. */}
        <View style={styles.guide} />
        <Text style={styles.hint}>Fill the frame with the card</Text>
      </View>
    </View>
  );
});

export { useCameraPermissions };

export const cameraSupported = true;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  guide: {
    width: '78%',
    aspectRatio: 63 / 88,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.md,
  },
  hint: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
