/** Money helpers. Everything internal is integer cents. */

/** Convert a provider's float dollars to cents, rounding half away from zero. */
export function dollarsToCents(dollars: number | null | undefined): number | null {
  if (dollars == null || !Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatCents(
  cents: number | null | undefined,
  currency = 'USD',
  locale = 'en-US',
): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Signed money, for deltas: "+$12.40" / "-$3.10". */
export function formatCentsSigned(cents: number | null | undefined, currency = 'USD'): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return `${sign}${formatCents(Math.abs(cents), currency)}`;
}

/** `ratio` is fractional: 0.25 -> "+25.0%". */
export function formatRatio(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  const sign = ratio > 0 ? '+' : ratio < 0 ? '-' : '';
  return `${sign}${(Math.abs(ratio) * 100).toFixed(digits)}%`;
}
