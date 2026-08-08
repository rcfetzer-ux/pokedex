import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { AlertWithCard } from '@pokedex/shared';

import { api } from '../../src/api/client';
import { useAsync } from '../../src/api/hooks';
import { Button, EmptyState, ErrorState, Loading, Screen } from '../../src/components/common';
import { colors, directionColor, magnitudeColors, radius, spacing } from '../../src/theme';

export default function AlertsScreen() {
  const router = useRouter();
  const state = useAsync(useCallback(() => api.alerts(), []));

  if (state.initialLoading) return <Loading label="Checking for swings…" />;
  if (state.error && !state.data) return <ErrorState message={state.error} onRetry={state.reload} />;

  const alerts = state.data?.alerts ?? [];
  const unread = state.data?.unread ?? 0;

  async function open(alert: AlertWithCard) {
    if (!alert.readAt) {
      // Optimistic: reload settles the badge, and a failed mark-read is not
      // worth blocking navigation over.
      void api.markAlertRead(alert.id).then(() => state.reload());
    }
    if (alert.card) router.push({ pathname: '/card/[id]', params: { id: alert.card.id } });
  }

  return (
    <Screen>
      <FlatList
        data={alerts}
        keyExtractor={(alert) => alert.id}
        refreshControl={
          <RefreshControl
            refreshing={state.loading}
            onRefresh={state.reload}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          unread > 0 ? (
            <View style={styles.header}>
              <Text style={styles.headerText}>
                {unread} unread {unread === 1 ? 'alert' : 'alerts'}
              </Text>
              <Button
                label="Mark all read"
                variant="secondary"
                onPress={async () => {
                  await api.markAllAlertsRead();
                  await state.reload();
                }}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            title="No alerts yet"
            hint="You'll be notified here — and on your phone — when a card you own swings sharply."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.alert,
              !item.readAt && styles.alertUnread,
              pressed && styles.alertPressed,
            ]}
            onPress={() => open(item)}
          >
            <View style={styles.alertHead}>
              <Text style={[styles.alertTitle, { color: directionColor(item.direction) }]}>
                {item.title}
              </Text>
              {!item.readAt ? <View style={styles.dot} /> : null}
            </View>

            <Text style={styles.alertBody}>{item.body}</Text>

            <View style={styles.alertMeta}>
              <Text style={[styles.tag, { color: magnitudeColors[item.magnitude] }]}>
                {item.magnitude}
              </Text>
              <Text style={styles.tag}>
                {item.kind === 'inventory_swing' ? 'your collection' : 'market'}
              </Text>
              <Text style={styles.timestamp}>{formatRelative(item.createdAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

function formatRelative(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
  },
  headerText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  alert: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  alertUnread: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  alertPressed: { opacity: 0.7 },
  alertHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  alertTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  alertBody: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  alertMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  tag: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  timestamp: { color: colors.textFaint, fontSize: 11, marginLeft: 'auto' },
});
