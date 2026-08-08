import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import { describeError } from '../api/hooks';
import { colors, radius, spacing } from '../theme';
import { Button } from './common';

export interface CatalogSetupProps {
  provider: string;
  onDone: () => void;
}

/**
 * First-run gate. A fresh install has an empty catalog, which makes scanning
 * silently useless — every photo matches nothing and there is no way to tell
 * that from a bad scan. So when the server reports zero cards, say so and give
 * the one action that fixes it.
 */
export function CatalogSetup({ provider, onDone }: CatalogSetupProps) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setError(null);
    setProgress('Downloading every set and card. This can take a few minutes.');
    try {
      const result = await api.syncCatalog();
      setProgress(`Imported ${result.cards} cards across ${result.sets} sets. Fetching prices…`);
      await api.refreshPrices();
      onDone();
    } catch (caught) {
      setError(describeError(caught));
      setProgress(null);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Set up your card catalog</Text>
      <Text style={styles.body}>
        No cards are loaded yet. Import the catalog so scanned cards can be identified and priced.
      </Text>
      <Text style={styles.provider}>Source: {provider}</Text>

      {progress ? <Text style={styles.progress}>{progress}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={syncing ? 'Importing…' : 'Import card catalog'}
        onPress={sync}
        disabled={syncing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    margin: spacing.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  provider: { color: colors.textFaint, fontSize: 12, marginBottom: spacing.sm },
  progress: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  error: { color: colors.down, fontSize: 13 },
});
