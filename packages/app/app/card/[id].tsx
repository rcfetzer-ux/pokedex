import { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { formatCents, variantLabel, type PriceVariant } from '@pokedex/shared';

import { api } from '../../src/api/client';
import { useAsync } from '../../src/api/hooks';
import { AddToCollection } from '../../src/components/AddToCollection';
import { PriceChart } from '../../src/components/PriceChart';
import {
  Button,
  ChangePill,
  ErrorState,
  Loading,
  Screen,
} from '../../src/components/common';
import { colors, radius, spacing } from '../../src/theme';

const HISTORY_DAYS = 30;

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();

  const [variant, setVariant] = useState<PriceVariant | null>(null);
  const [adding, setAdding] = useState(false);

  const detail = useAsync(useCallback(() => api.card(id), [id]), [id]);
  const history = useAsync(useCallback(() => api.history(id, HISTORY_DAYS), [id]), [id]);

  if (detail.initialLoading) return <Loading />;
  if (detail.error && !detail.data) {
    return <ErrorState message={detail.error} onRetry={detail.reload} />;
  }

  const card = detail.data?.card;
  if (!card) return <ErrorState message="Card not found." />;

  const prices = detail.data?.prices ?? [];
  const activeVariant = variant ?? prices[0]?.variant ?? card.variants[0] ?? 'normal';
  const activePrice = prices.find((price) => price.variant === activeVariant);
  const series = history.data?.series.find((entry) => entry.variant === activeVariant);

  // Chart width tracks the viewport so it looks right on a phone and on a
  // maximised desktop window alike.
  const chartWidth = Math.min(width, 720) - spacing.lg * 4;

  return (
    <Screen>
      <Stack.Screen options={{ title: card.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {card.imageLarge ? (
            <Image source={{ uri: card.imageLarge }} style={styles.image} resizeMode="contain" />
          ) : null}
          <View style={styles.heroBody}>
            <Text style={styles.name}>{card.name}</Text>
            <Text style={styles.meta}>
              {card.set.name} · #{card.number}
              {card.set.printedTotal ? `/${card.set.printedTotal}` : ''}
            </Text>
            {card.rarity ? <Text style={styles.meta}>{card.rarity}</Text> : null}
            {card.set.releaseDate ? (
              <Text style={styles.metaFaint}>Released {card.set.releaseDate}</Text>
            ) : null}
          </View>
        </View>

        {prices.length > 1 ? (
          <View style={styles.variants}>
            {prices.map((price) => (
              <Text
                key={price.variant}
                onPress={() => setVariant(price.variant)}
                style={[
                  styles.variantChip,
                  price.variant === activeVariant && styles.variantChipSelected,
                ]}
              >
                {variantLabel(price.variant)}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.priceBlock}>
          <Text style={styles.price}>{formatCents(activePrice?.marketCents)}</Text>
          <View style={styles.changes}>
            {Object.entries(activePrice?.changes ?? {}).map(([hours, change]) => (
              <View key={hours} style={styles.changeEntry}>
                <Text style={styles.changeLabel}>{hours === '24' ? '24h' : `${Number(hours) / 24}d`}</Text>
                <ChangePill change={change} />
              </View>
            ))}
          </View>
          {activePrice ? (
            <Text style={styles.spread}>
              low {formatCents(activePrice.lowCents)} · high {formatCents(activePrice.highCents)}
            </Text>
          ) : (
            <Text style={styles.spread}>No market price recorded for this printing yet.</Text>
          )}
        </View>

        <View style={styles.chartBlock}>
          <Text style={styles.sectionTitle}>Last {HISTORY_DAYS} days</Text>
          {history.initialLoading ? (
            <Loading label="" />
          ) : (
            <PriceChart points={series?.points ?? []} width={chartWidth} />
          )}
        </View>

        <Button label="Add to collection" onPress={() => setAdding(true)} />
      </ScrollView>

      <AddToCollection
        card={adding ? card : null}
        suggestedPriceCents={activePrice?.marketCents ?? null}
        onClose={() => setAdding(false)}
        onAdded={() => setAdding(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  hero: { flexDirection: 'row', gap: spacing.lg },
  image: { width: 120, height: 168, borderRadius: radius.md },
  heroBody: { flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontSize: 22, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 13 },
  metaFaint: { color: colors.textFaint, fontSize: 12 },
  variants: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  variantChip: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  variantChipSelected: {
    color: '#1A1206',
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  priceBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  price: { color: colors.text, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  changes: { flexDirection: 'row', gap: spacing.xl },
  changeEntry: { gap: 2 },
  changeLabel: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  spread: { color: colors.textFaint, fontSize: 12 },
  chartBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
