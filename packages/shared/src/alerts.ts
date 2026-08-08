import { formatCents, formatRatio } from './money.js';
import type { AlertKind, PriceChange, PriceVariant, SwingMagnitude } from './types.js';

/** Human labels for printing variants. */
export const VARIANT_LABELS: Record<PriceVariant, string> = {
  normal: 'Normal',
  holofoil: 'Holofoil',
  reverseHolofoil: 'Reverse Holo',
  '1stEditionNormal': '1st Edition',
  '1stEditionHolofoil': '1st Ed. Holo',
};

export function variantLabel(variant: PriceVariant): string {
  return VARIANT_LABELS[variant] ?? variant;
}

export const MAGNITUDE_LABELS: Record<SwingMagnitude, string> = {
  none: 'Flat',
  minor: 'Minor',
  notable: 'Notable',
  major: 'Major',
  extreme: 'Extreme',
};

export interface AlertCopy {
  title: string;
  body: string;
}

/**
 * One place to compose alert wording, so the push notification, the in-app
 * feed and the email digest can never drift apart.
 */
export function composeAlertCopy(input: {
  kind: AlertKind;
  cardName: string;
  setName: string;
  variant: PriceVariant;
  change: PriceChange;
  /** Copies held, for inventory alerts. */
  quantity?: number;
}): AlertCopy {
  const { kind, cardName, setName, variant, change, quantity } = input;
  const arrow = change.direction === 'up' ? '▲' : change.direction === 'down' ? '▼' : '—';
  const verb = change.direction === 'up' ? 'up' : 'down';

  const title = `${arrow} ${cardName} ${formatRatio(change.changeRatio)} (${change.windowHours}h)`;

  const priceMove = `${formatCents(change.fromCents)} → ${formatCents(change.toCents)}`;
  const descriptor = `${setName} · ${variantLabel(variant)}`;

  if (kind === 'inventory_swing') {
    const held = quantity && quantity > 0 ? quantity : 1;
    const positionDelta = change.changeCents * held;
    const holding = held === 1 ? 'your copy' : `your ${held} copies`;
    const body =
      `${descriptor} — ${priceMove}. ` +
      `${holding} ${verb} ${formatCents(Math.abs(positionDelta))}.`;
    return { title, body };
  }

  return { title, body: `${descriptor} — ${priceMove}. Not in your collection.` };
}
