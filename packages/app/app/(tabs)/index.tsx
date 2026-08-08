import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { formatCents, formatCentsSigned, formatRatio } from '@pokedex/shared';

import { api } from '../../src/api/client';
import { useAsync } from '../../src/api/hooks';
import { CardRow } from '../../src/components/CardRow';
import { EmptyState, ErrorState, Loading, Screen } from '../../src/components/common';
import { colors, directionColor, radius, spacing } from '../../src/theme';

export default function CollectionScreen() {
  const state = useAsync(useCallback(() => api.collection(24), []));

  if (state.initialLoading) return <Loading label="Valuing your collection…" />;
  if (state.error && !state.data) return <ErrorState message={state.error} onRetry={state.reload} />;

  const data = state.data;
  const summary = data?.summary;

  return (
    <Screen>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={state.loading}
            onRefresh={state.reload}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={summary ? <PortfolioHeader summary={summary} /> : null}
        ListEmptyComponent={
          <EmptyState
            title="No cards yet"
            hint="Head to the Scan tab to add your first card."
          />
        }
        renderItem={({ item }) => (
          <CardRow
            card={item.card}
            variant={item.variant}
            // The list is ordered by position value, so that is what the row
            // shows; a 2x holding displaying its unit price next to rows
            // ordered on totals reads as a sorting bug.
            priceCents={item.totalValueCents}
            change={item.change24h}
            subtitle={buildSubtitle(item)}
          />
        )}
      />
    </Screen>
  );
}

function buildSubtitle(item: {
  quantity: number;
  condition: string;
  gradingCompany: string | null;
  grade: number | null;
  unitValueCents: number | null;
}): string {
  const parts: string[] = [];
  parts.push(
    item.gradingCompany && item.grade != null
      ? `${item.gradingCompany} ${item.grade}`
      : item.condition,
  );
  // Spell out the maths behind the position value for multi-copy holdings.
  if (item.quantity > 1) parts.push(`${item.quantity} × ${formatCents(item.unitValueCents)}`);
  return parts.join(' · ');
}

function PortfolioHeader({
  summary,
}: {
  summary: NonNullable<Awaited<ReturnType<typeof api.collection>>['summary']>;
}) {
  const gainRatio =
    summary.totalCostCents > 0 ? summary.gainCents / summary.totalCostCents : null;
  const changeDirection =
    summary.change24hCents > 0 ? 'up' : summary.change24hCents < 0 ? 'down' : 'flat';

  return (
    <View style={styles.header}>
      <Text style={styles.headerLabel}>Collection value</Text>
      <Text style={styles.headerValue}>{formatCents(summary.totalValueCents)}</Text>

      <View style={styles.headerRow}>
        <Text style={[styles.headerChange, { color: directionColor(changeDirection) }]}>
          {formatCentsSigned(summary.change24hCents)} today
        </Text>
      </View>

      <View style={styles.stats}>
        <Stat label="Cards" value={String(summary.copies)} />
        <Stat label="Unique" value={String(summary.distinctCards)} />
        <Stat label="Cost basis" value={formatCents(summary.totalCostCents)} />
        <Stat
          label="Unrealised"
          value={formatCentsSigned(summary.gainCents)}
          detail={gainRatio == null ? undefined : formatRatio(gainRatio)}
          color={directionColor(
            summary.gainCents > 0 ? 'up' : summary.gainCents < 0 ? 'down' : 'flat',
          )}
        />
      </View>

      {summary.unpricedCopies > 0 ? (
        <Text style={styles.note}>
          {summary.unpricedCopies} {summary.unpricedCopies === 1 ? 'copy has' : 'copies have'} no
          market price yet and are excluded from the total.
        </Text>
      ) : null}
    </View>
  );
}

function Stat({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail?: string;
  color?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      {detail ? <Text style={[styles.statDetail, color ? { color } : null]}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerValue: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerChange: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  stat: {
    flexGrow: 1,
    flexBasis: '22%',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  statLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  statValue: { color: colors.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statDetail: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  note: { color: colors.textFaint, fontSize: 12, marginTop: spacing.sm },
});
