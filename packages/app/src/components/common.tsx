import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCents, formatRatio, variantLabel, type PriceChange, type PriceVariant } from '@pokedex/shared';

import { colors, directionColor, magnitudeColors, radius, spacing } from '../theme';

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.muted}>{hint}</Text> : null}
    </View>
  );
}

/** Percentage move, coloured by direction. The most repeated element here. */
export function ChangePill({ change }: { change: PriceChange | null | undefined }) {
  if (!change) {
    return <Text style={[styles.pill, styles.pillFlat]}>—</Text>;
  }

  const arrow = change.direction === 'up' ? '▲' : change.direction === 'down' ? '▼' : '–';
  return (
    <Text style={[styles.pill, { color: directionColor(change.direction) }]}>
      {arrow} {formatRatio(change.changeRatio)}
    </Text>
  );
}

export function MagnitudeBadge({ magnitude }: { magnitude: string }) {
  if (magnitude === 'none') return null;
  return (
    <Text style={[styles.badge, { color: magnitudeColors[magnitude] ?? colors.textMuted }]}>
      {magnitude}
    </Text>
  );
}

export function VariantBadge({ variant }: { variant: PriceVariant }) {
  return <Text style={styles.badge}>{variantLabel(variant)}</Text>;
}

export function Money({
  cents,
  size = 'md',
  muted = false,
}: {
  cents: number | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  muted?: boolean;
}) {
  return (
    <Text style={[styles.money, styles[`money_${size}`], muted && styles.muted]}>
      {formatCents(cents)}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (pressed || disabled) && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.buttonTextSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  muted: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  errorTitle: { color: colors.down, fontSize: 16, fontWeight: '700' },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  pill: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pillFlat: { color: colors.textFaint },
  badge: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  money: { color: colors.text, fontVariant: ['tabular-nums'], fontWeight: '600' },
  money_sm: { fontSize: 13 },
  money_md: { fontSize: 15 },
  money_lg: { fontSize: 20 },
  money_xl: { fontSize: 32, fontWeight: '800' },
  button: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDanger: { backgroundColor: colors.down },
  buttonPressed: { opacity: 0.6 },
  buttonText: { color: '#1A1206', fontWeight: '700', fontSize: 15 },
  buttonTextSecondary: { color: colors.text },
});

export { styles as commonStyles };
