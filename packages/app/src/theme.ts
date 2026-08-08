/** Shared visual language. Dark-first, because the movers feed is a night read. */
export const colors = {
  background: '#0B1120',
  surface: '#151E31',
  surfaceRaised: '#1D2941',
  border: '#26334D',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  textFaint: '#64748B',
  accent: '#F5A524',
  up: '#22C55E',
  down: '#EF4444',
  flat: '#64748B',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Colour for a price move; used by every change readout in the app. */
export function directionColor(direction: 'up' | 'down' | 'flat' | undefined): string {
  if (direction === 'up') return colors.up;
  if (direction === 'down') return colors.down;
  return colors.flat;
}

export const magnitudeColors: Record<string, string> = {
  none: colors.textFaint,
  minor: colors.textMuted,
  notable: '#38BDF8',
  major: colors.accent,
  extreme: '#F43F5E',
};
