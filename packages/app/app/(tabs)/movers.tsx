import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { formatCents } from '@pokedex/shared';

import { api } from '../../src/api/client';
import { useAsync } from '../../src/api/hooks';
import { CardRow } from '../../src/components/CardRow';
import { EmptyState, ErrorState, Loading, Screen } from '../../src/components/common';
import { colors, radius, spacing } from '../../src/theme';

type Direction = 'both' | 'up' | 'down';

const WINDOWS: { label: string; hours: number }[] = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

/**
 * Cards outside the collection that moved hard in the trailing window — the
 * "what should I be looking at that I don't already own" feed.
 */
export default function MoversScreen() {
  const [windowHours, setWindowHours] = useState(24);
  const [direction, setDirection] = useState<Direction>('both');

  const state = useAsync(
    useCallback(
      () => api.movers({ windowHours, direction, minMagnitude: 'major', limit: 50 }),
      [windowHours, direction],
    ),
    [windowHours, direction],
  );
  const status = useAsync(useCallback(() => api.status(), []));

  if (state.initialLoading) return <Loading label="Scanning the market…" />;
  if (state.error && !state.data) return <ErrorState message={state.error} onRetry={state.reload} />;

  return (
    <Screen>
      <FlatList
        data={state.data?.movers ?? []}
        keyExtractor={(mover) => `${mover.card.id}-${mover.variant}`}
        refreshControl={
          <RefreshControl
            refreshing={state.loading}
            onRefresh={state.reload}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.filters}>
            <FilterGroup
              options={WINDOWS.map((entry) => ({
                value: String(entry.hours),
                label: entry.label,
              }))}
              selected={String(windowHours)}
              onSelect={(value) => setWindowHours(Number(value))}
            />
            <FilterGroup
              options={[
                { value: 'both', label: 'All' },
                { value: 'up', label: 'Risers' },
                { value: 'down', label: 'Fallers' },
              ]}
              selected={direction}
              onSelect={(value) => setDirection(value as Direction)}
            />
          </View>
        }
        ListEmptyComponent={<MoversEmpty windowHours={windowHours} status={status.data} />}
        renderItem={({ item }) => (
          <CardRow
            card={item.card}
            variant={item.variant}
            priceCents={item.change.toCents}
            change={item.change}
            subtitle={`was ${formatCents(item.change.fromCents)}`}
          />
        )}
      />
    </Screen>
  );
}

/**
 * "Nothing moved" and "we have not been watching long enough to say" look
 * identical in the data and mean completely different things to the user, so
 * they get different copy.
 */
function MoversEmpty({
  windowHours,
  status,
}: {
  windowHours: number;
  status: { historyStartedAt: number | null } | null;
}) {
  const label = windowHours === 24 ? '24 hours' : '7 days';

  const trackedMs = status?.historyStartedAt == null ? 0 : Date.now() - status.historyStartedAt;
  if (trackedMs < windowHours * 60 * 60 * 1000) {
    const remainingHours = Math.max(1, Math.ceil(windowHours - trackedMs / (60 * 60 * 1000)));
    return (
      <EmptyState
        title="Still building price history"
        hint={`Swings over ${label} need a full ${label} of recorded prices. About ${remainingHours}h to go — leave the server running and check back.`}
      />
    );
  }

  return (
    <EmptyState
      title="Nothing major moved"
      hint={`No card outside your collection swung significantly in the last ${label}.`}
    />
  );
}

function FilterGroup({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.group}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          style={[styles.chip, selected === option.value && styles.chipSelected]}
          onPress={() => onSelect(option.value)}
        >
          <Text style={[styles.chipText, selected === option.value && styles.chipTextSelected]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
  },
  group: { flexDirection: 'row', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: '#1A1206' },
});
