import type { PriceChange, PricePoint, SwingDirection, SwingMagnitude } from './types.js';

/**
 * Tuning for "is this move worth waking someone up for?".
 *
 * Percent alone is a bad signal for trading cards: a bulk common ticking from
 * $0.03 to $0.09 is +200% and means nothing, while a sealed-era chase card
 * moving $1,800 -> $1,950 is only +8.3% and is very much news. So a move is
 * classified on BOTH axes and takes the higher rating, with an absolute-dollar
 * floor that suppresses penny noise entirely.
 */
export interface SwingThresholds {
  /** Moves smaller than this many cents are never more than 'none'. */
  floorCents: number;
  /** |ratio| tiers, ascending. */
  ratioMinor: number;
  ratioNotable: number;
  ratioMajor: number;
  ratioExtreme: number;
  /** |cents| tiers, ascending. Only applied when |ratio| >= absRatioGate. */
  absNotableCents: number;
  absMajorCents: number;
  absExtremeCents: number;
  /**
   * A big dollar move on an expensive card still has to be a real move, not
   * rounding. Absolute-tier escalation is ignored below this ratio.
   */
  absRatioGate: number;
}

export const DEFAULT_THRESHOLDS: SwingThresholds = {
  floorCents: 50,
  ratioMinor: 0.05,
  ratioNotable: 0.1,
  ratioMajor: 0.2,
  ratioExtreme: 0.5,
  absNotableCents: 2_500,
  absMajorCents: 10_000,
  absExtremeCents: 50_000,
  absRatioGate: 0.02,
};

/** Magnitudes at or above this are what we notify on by default. */
export const NOTIFY_AT_OR_ABOVE: SwingMagnitude = 'major';

const MAGNITUDE_RANK: Record<SwingMagnitude, number> = {
  none: 0,
  minor: 1,
  notable: 2,
  major: 3,
  extreme: 4,
};

export function magnitudeRank(magnitude: SwingMagnitude): number {
  return MAGNITUDE_RANK[magnitude];
}

export function meetsMagnitude(magnitude: SwingMagnitude, minimum: SwingMagnitude): boolean {
  return MAGNITUDE_RANK[magnitude] >= MAGNITUDE_RANK[minimum];
}

export function classifySwing(
  changeCents: number,
  changeRatio: number,
  thresholds: SwingThresholds = DEFAULT_THRESHOLDS,
): SwingMagnitude {
  const absCents = Math.abs(changeCents);
  const absRatio = Math.abs(changeRatio);

  if (absCents < thresholds.floorCents) return 'none';

  let byRatio: SwingMagnitude = 'none';
  if (absRatio >= thresholds.ratioExtreme) byRatio = 'extreme';
  else if (absRatio >= thresholds.ratioMajor) byRatio = 'major';
  else if (absRatio >= thresholds.ratioNotable) byRatio = 'notable';
  else if (absRatio >= thresholds.ratioMinor) byRatio = 'minor';

  let byAbs: SwingMagnitude = 'none';
  if (absRatio >= thresholds.absRatioGate) {
    if (absCents >= thresholds.absExtremeCents) byAbs = 'extreme';
    else if (absCents >= thresholds.absMajorCents) byAbs = 'major';
    else if (absCents >= thresholds.absNotableCents) byAbs = 'notable';
  }

  return MAGNITUDE_RANK[byAbs] > MAGNITUDE_RANK[byRatio] ? byAbs : byRatio;
}

export function direction(changeCents: number): SwingDirection {
  if (changeCents > 0) return 'up';
  if (changeCents < 0) return 'down';
  return 'flat';
}

export interface ComputeChangeOptions {
  thresholds?: SwingThresholds;
  windowHours?: number;
  fromTs?: number;
  toTs?: number;
}

/**
 * Build a PriceChange from two prices. Returns null when the baseline is zero
 * or negative — a card with no prior price hasn't "swung", it just appeared,
 * and reporting +Infinity% would poison every ranking that sorts on ratio.
 */
export function computeChange(
  fromCents: number,
  toCents: number,
  options: ComputeChangeOptions = {},
): PriceChange | null {
  if (!Number.isFinite(fromCents) || !Number.isFinite(toCents)) return null;
  if (fromCents <= 0) return null;

  const changeCents = toCents - fromCents;
  const changeRatio = changeCents / fromCents;
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;

  return {
    fromCents,
    toCents,
    changeCents,
    changeRatio,
    direction: direction(changeCents),
    magnitude: classifySwing(changeCents, changeRatio, thresholds),
    windowHours: options.windowHours ?? 24,
    fromTs: options.fromTs ?? 0,
    toTs: options.toTs ?? 0,
  };
}

export const HOUR_MS = 60 * 60 * 1000;

export interface BaselineOptions {
  /**
   * If no snapshot exists at or before the window start, accept the oldest
   * snapshot we do have, as long as it is no more than this far *after* the
   * window start. Covers cards we only began tracking part-way through the
   * window without silently comparing against a much newer price.
   */
  toleranceMs?: number;
}

/**
 * Pick the snapshot that best represents the price at `targetTs`: the newest
 * point at or before it, else the oldest point within tolerance after it.
 */
export function pickBaseline(
  series: readonly PricePoint[],
  targetTs: number,
  options: BaselineOptions = {},
): PricePoint | null {
  const tolerance = options.toleranceMs ?? 6 * HOUR_MS;
  const sorted = [...series].sort((a, b) => a.ts - b.ts);

  let best: PricePoint | null = null;
  for (const point of sorted) {
    if (point.ts <= targetTs) best = point;
    else break;
  }
  if (best) return best;

  const first = sorted[0];
  if (first && first.ts - targetTs <= tolerance) return first;
  return null;
}

export interface SeriesChangeOptions extends BaselineOptions {
  thresholds?: SwingThresholds;
  /** Defaults to Date.now(). */
  now?: number;
}

/**
 * Change over the trailing `windowHours` for one card+variant series.
 * Returns null when there is no usable baseline or no current price.
 */
export function computeSeriesChange(
  series: readonly PricePoint[],
  windowHours: number,
  options: SeriesChangeOptions = {},
): PriceChange | null {
  if (series.length === 0) return null;
  const now = options.now ?? Date.now();
  const sorted = [...series].sort((a, b) => a.ts - b.ts);

  const latest = sorted[sorted.length - 1];
  if (!latest) return null;

  const baseline = pickBaseline(sorted, now - windowHours * HOUR_MS, options);
  if (!baseline || baseline.ts >= latest.ts) return null;

  return computeChange(baseline.marketCents, latest.marketCents, {
    thresholds: options.thresholds,
    windowHours,
    fromTs: baseline.ts,
    toTs: latest.ts,
  });
}

/** Sort key for "biggest movers first" — magnitude, then absolute percent. */
export function moverScore(change: PriceChange): number {
  return MAGNITUDE_RANK[change.magnitude] * 1000 + Math.abs(change.changeRatio);
}
