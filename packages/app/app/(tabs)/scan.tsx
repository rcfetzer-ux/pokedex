import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { formatCents, type CardWithSet } from '@pokedex/shared';

import { api, type ScanResponse } from '../../src/api/client';
import { describeError } from '../../src/api/hooks';
import { AddToCollection } from '../../src/components/AddToCollection';
import {
  CardCamera,
  cameraSupported,
  useCameraPermissions,
  type CardCameraHandle,
} from '../../src/components/CardCamera';
import { Button, Screen } from '../../src/components/common';
import { colors, radius, spacing } from '../../src/theme';

type Mode = 'idle' | 'camera' | 'working' | 'results';

export default function ScanScreen() {
  const [mode, setMode] = useState<Mode>('idle');
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ card: CardWithSet; price: number | null } | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CardCameraHandle | null>(null);

  async function runScan(scan: () => Promise<ScanResponse>) {
    setMode('working');
    setError(null);
    setStatus(null);
    try {
      const response = await scan();
      setResult(response);
      setMode('results');
      if (response.candidates.length === 0) {
        setStatus('No match found. Try the manual entry below, or retake the photo.');
      }
    } catch (caught) {
      setError(describeError(caught));
      setMode('idle');
    }
  }

  async function captureFromCamera() {
    const base64 = await cameraRef.current?.capture();
    if (!base64) {
      setError('The camera returned no image data.');
      return;
    }
    await runScan(() => api.scanImage(base64));
  }

  async function pickFromLibrary() {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.6,
    });
    if (picked.canceled) return;

    const asset = picked.assets[0];
    if (!asset?.base64) {
      setError('That image could not be read.');
      return;
    }
    await runScan(() => api.scanImage(asset.base64!));
  }

  if (mode === 'camera') {
    return (
      <Screen>
        <CardCamera ref={cameraRef} style={styles.camera} />
        <View style={styles.cameraActions}>
          <Button label="Cancel" variant="secondary" onPress={() => setMode('idle')} />
          <Button label="Capture" onPress={captureFromCamera} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {mode === 'working' ? <Text style={styles.working}>Reading the card…</Text> : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {status ? <Text style={styles.status}>{status}</Text> : null}

        {mode !== 'results' ? (
          <View style={styles.actions}>
            {cameraSupported ? (
              <Button
                label="Scan with camera"
                onPress={async () => {
                  if (!permission?.granted) {
                    const next = await requestPermission();
                    if (!next.granted) {
                      setError('Camera permission is needed to scan a card.');
                      return;
                    }
                  }
                  setError(null);
                  setMode('camera');
                }}
              />
            ) : null}
            <Button label="Choose a photo" variant="secondary" onPress={pickFromLibrary} />
          </View>
        ) : null}

        <View style={styles.manual}>
          <Text style={styles.manualLabel}>Or type what the card says</Text>
          <Text style={styles.manualHint}>
            The name and the collector number ("Charizard 4/102") are enough.
          </Text>
          <TextInput
            style={styles.manualInput}
            value={manualText}
            onChangeText={setManualText}
            placeholder={'Charizard\n4/102'}
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <Button
            label="Identify"
            variant="secondary"
            disabled={manualText.trim().length === 0}
            onPress={() => runScan(() => api.scanText(manualText))}
          />
        </View>

        {result ? <ScanResults result={result} onPick={setSelected} /> : null}

        {mode === 'results' ? (
          <Button
            label="Scan another"
            variant="secondary"
            onPress={() => {
              setResult(null);
              setStatus(null);
              setMode('idle');
            }}
          />
        ) : null}
      </ScrollView>

      <AddToCollection
        card={selected?.card ?? null}
        suggestedPriceCents={selected?.price ?? null}
        onClose={() => setSelected(null)}
        onAdded={() => {
          setSelected(null);
          setStatus('Added to your collection.');
        }}
      />
    </Screen>
  );
}

function ScanResults({
  result,
  onPick,
}: {
  result: ScanResponse;
  onPick: (value: { card: CardWithSet; price: number | null }) => void;
}) {
  if (result.candidates.length === 0) return null;

  return (
    <View style={styles.results}>
      <Text style={styles.resultsTitle}>
        {result.autoAcceptable ? 'Match found' : 'Which one is it?'}
      </Text>

      {!result.autoAcceptable ? (
        <Text style={styles.resultsHint}>
          Several printings look alike — pick the right one so its value tracks correctly.
        </Text>
      ) : null}

      <Text style={styles.parsed}>
        Read: {result.parsed.name ?? 'unknown name'}
        {result.parsed.number ? ` · #${result.parsed.number}` : ''}
        {result.parsed.printedTotal ? `/${result.parsed.printedTotal}` : ''}
      </Text>

      {result.candidates.map((candidate) => (
        <Pressable
          key={`${candidate.card.id}-${candidate.score}`}
          style={({ pressed }) => [styles.candidate, pressed && styles.candidatePressed]}
          onPress={() => onPick({ card: candidate.card, price: candidate.latestPriceCents })}
        >
          <View style={styles.candidateBody}>
            <Text style={styles.candidateName}>{candidate.card.name}</Text>
            <Text style={styles.candidateMeta}>
              {candidate.card.set.name} · #{candidate.card.number}
            </Text>
            {candidate.reasons.length > 0 ? (
              <Text style={styles.candidateReasons}>{candidate.reasons.join(' · ')}</Text>
            ) : null}
          </View>
          <View style={styles.candidateRight}>
            <Text style={styles.candidatePrice}>{formatCents(candidate.latestPriceCents)}</Text>
            <Text style={styles.candidateScore}>{Math.round(candidate.score * 100)}% match</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  working: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  actions: { gap: spacing.md },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: colors.down,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: { color: colors.down, fontSize: 13 },
  status: { color: colors.accent, fontSize: 13, fontWeight: '600' },

  camera: { flex: 1 },
  cameraActions: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },

  manual: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  manualLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  manualHint: { color: colors.textFaint, fontSize: 12 },
  manualInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    color: colors.text,
    fontSize: 15,
    minHeight: 72,
    textAlignVertical: 'top',
  },

  results: { gap: spacing.sm },
  resultsTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  resultsHint: { color: colors.textMuted, fontSize: 13 },
  parsed: { color: colors.textFaint, fontSize: 12, fontStyle: 'italic' },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  candidatePressed: { borderColor: colors.accent },
  candidateBody: { flex: 1, gap: 2 },
  candidateName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  candidateMeta: { color: colors.textMuted, fontSize: 12 },
  candidateReasons: { color: colors.textFaint, fontSize: 11 },
  candidateRight: { alignItems: 'flex-end', gap: 2 },
  candidatePrice: { color: colors.text, fontSize: 15, fontWeight: '700' },
  candidateScore: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
});
