import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { formatCents, type CardWithSet, type PriceChange, type PriceVariant } from '@pokedex/shared';

import { colors, radius, spacing } from '../theme';
import { ChangePill, VariantBadge } from './common';

export interface CardRowProps {
  card: CardWithSet;
  variant?: PriceVariant;
  priceCents?: number | null;
  change?: PriceChange | null;
  /** Right-hand secondary line, e.g. "3 copies · $120.00". */
  subtitle?: string;
  onPress?: () => void;
}

/**
 * One card in a list. Used by the collection, movers and search results so a
 * card looks identical wherever it appears.
 */
export function CardRow({ card, variant, priceCents, change, subtitle, onPress }: CardRowProps) {
  const router = useRouter();

  const handlePress =
    onPress ?? (() => router.push({ pathname: '/card/[id]', params: { id: card.id } }));

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={handlePress}
    >
      {card.imageSmall ? (
        <Image source={{ uri: card.imageSmall }} style={styles.thumb} resizeMode="contain" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Text style={styles.thumbText}>{card.number}</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {card.set.name} · #{card.number}
          {card.set.printedTotal ? `/${card.set.printedTotal}` : ''}
        </Text>
        <View style={styles.badges}>
          {variant ? <VariantBadge variant={variant} /> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.price}>{formatCents(priceCents)}</Text>
        <ChangePill change={change} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.surface },
  thumb: { width: 40, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbText: { color: colors.textFaint, fontSize: 11, fontWeight: '700' },
  body: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  subtitle: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
  right: { alignItems: 'flex-end', gap: 2 },
  price: { color: colors.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
