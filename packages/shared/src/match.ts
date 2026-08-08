import type { CardSet, ParsedCardText } from './types.js';

/**
 * Scoring scanned text against the catalog.
 *
 * Signals are weighted and then re-normalized over the signals that are
 * actually present, so a scan where the collector number was unreadable is
 * still scored on a 0..1 scale instead of being capped at 0.55 and failing
 * every confidence check downstream.
 */

const WEIGHT_NAME = 0.55;
const WEIGHT_NUMBER = 0.3;
const WEIGHT_TOTAL = 0.15;
/** Only scored when the scan yielded a code AND the set has one to compare. */
const WEIGHT_SET_CODE = 0.15;

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Punctuation-free form. Card names are full of apostrophes and hyphens
 * ("Farfetch'd", "Ho-Oh", "Porygon-Z") that OCR drops, doubles, or turns into
 * spaces at random; collapsing them away makes all those readings identical.
 */
export function tightenName(value: string): string {
  return normalizeName(value).replace(/ /g, '');
}

export function normalizeNumber(value: string): string {
  const trimmed = value.trim().toUpperCase();
  return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      const substitution = (previous[j - 1] ?? 0) + cost;
      current[j] = Math.min(deletion, insertion, substitution);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length] ?? 0;
}

function editRatio(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  return 1 - levenshtein(left, right) / Math.max(left.length, right.length);
}

/** 0..1 edit-distance similarity on normalized strings. */
export function similarity(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  // Compared both spaced and punctuation-free, taking the better reading:
  // whitespace is the least reliable thing OCR reports.
  const tightLeft = tightenName(a);
  const tightRight = tightenName(b);
  if (tightLeft === tightRight) return 1;

  const ratio = Math.max(editRatio(left, right), editRatio(tightLeft, tightRight));

  // OCR loves to glue neighbouring text onto the name ("charizard ex 330 hp").
  // Containment rescues those without rewarding a one-word coincidence.
  const longer = tightLeft.length >= tightRight.length ? tightLeft : tightRight;
  const shorter = tightLeft.length >= tightRight.length ? tightRight : tightLeft;
  const contained = shorter.length >= 4 && longer.includes(shorter) ? 0.9 : 0;

  return Math.max(ratio, contained);
}

export interface ScoreTarget {
  name: string;
  number: string;
  set: Pick<CardSet, 'printedTotal' | 'total' | 'ptcgoCode'>;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export function scoreCard(parsed: ParsedCardText, target: ScoreTarget): ScoreResult {
  const reasons: string[] = [];
  let weighted = 0;
  let totalWeight = 0;

  const nameOptions = parsed.name ? [parsed.name, ...parsed.lines] : parsed.lines;
  if (nameOptions.length > 0) {
    let best = 0;
    let bestSource = '';
    for (const option of nameOptions) {
      const value = similarity(option, target.name);
      if (value > best) {
        best = value;
        bestSource = option;
      }
    }
    weighted += best * WEIGHT_NAME;
    totalWeight += WEIGHT_NAME;
    if (best >= 0.75) reasons.push(`name "${bestSource}" ≈ ${target.name}`);
  }

  if (parsed.number) {
    const matches = normalizeNumber(parsed.number) === normalizeNumber(target.number);
    weighted += (matches ? 1 : 0) * WEIGHT_NUMBER;
    totalWeight += WEIGHT_NUMBER;
    if (matches) reasons.push(`collector number ${target.number}`);
  }

  if (parsed.printedTotal != null) {
    const matches =
      parsed.printedTotal === target.set.printedTotal || parsed.printedTotal === target.set.total;
    weighted += (matches ? 1 : 0) * WEIGHT_TOTAL;
    totalWeight += WEIGHT_TOTAL;
    if (matches) reasons.push(`set size /${parsed.printedTotal}`);
  }

  // Scored as a full signal rather than a bonus: a bonus on top of an already
  // saturated score cannot break a tie, and breaking ties between identical
  // reprints in different sets is the only thing the set code is good for.
  if (parsed.setCode && target.set.ptcgoCode) {
    const matches = parsed.setCode === target.set.ptcgoCode;
    weighted += (matches ? 1 : 0) * WEIGHT_SET_CODE;
    totalWeight += WEIGHT_SET_CODE;
    if (matches) reasons.push(`set code ${target.set.ptcgoCode}`);
  }

  if (totalWeight === 0) return { score: 0, reasons };

  return { score: weighted / totalWeight, reasons };
}

export interface RankedMatch<T> {
  item: T;
  score: number;
  reasons: string[];
}

export interface RankOptions {
  limit?: number;
  /** Drop anything below this score. */
  minScore?: number;
}

export function rankMatches<T>(
  parsed: ParsedCardText,
  items: readonly T[],
  toTarget: (item: T) => ScoreTarget,
  options: RankOptions = {},
): RankedMatch<T>[] {
  const limit = options.limit ?? 10;
  const minScore = options.minScore ?? 0.35;

  const ranked: RankedMatch<T>[] = [];
  for (const item of items) {
    const { score, reasons } = scoreCard(parsed, toTarget(item));
    if (score >= minScore) ranked.push({ item, score, reasons });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}
