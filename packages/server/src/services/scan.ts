import {
  parseCardText,
  rankMatches,
  type CardWithSet,
  type ParsedCardText,
  type ScanCandidate,
} from '@pokedex/shared';

import type { Db } from '../db/index.js';
import { findScanCandidates } from '../repos/cards.js';
import { getLatestPricesForCard } from '../repos/prices.js';
import type { OcrEngine } from './ocr.js';

export interface ScanResult {
  parsed: ParsedCardText;
  candidates: ScanCandidate[];
  /** Raw OCR text, so a user can see what the scanner actually read. */
  text: string;
  /** True when the top match is confident enough to add without confirmation. */
  autoAcceptable: boolean;
}

export interface ScanOptions {
  limit?: number;
  minScore?: number;
  /** Score the top match must beat, and beat the runner-up by, to auto-accept. */
  autoAcceptScore?: number;
  autoAcceptMargin?: number;
}

const DEFAULTS = {
  limit: 8,
  minScore: 0.4,
  autoAcceptScore: 0.92,
  autoAcceptMargin: 0.08,
};

/** Identify a card from already-recognized text. */
export function scanFromText(db: Db, text: string, options: ScanOptions = {}): ScanResult {
  const settings = { ...DEFAULTS, ...options };
  const parsed = parseCardText(text);

  const pool = findScanCandidates(db, parsed);
  const ranked = rankMatches<CardWithSet>(parsed, pool, (card) => ({
    name: card.name,
    number: card.number,
    set: card.set,
  }), { limit: settings.limit, minScore: settings.minScore });

  const candidates: ScanCandidate[] = ranked.map((match) => ({
    card: match.item,
    score: match.score,
    reasons: match.reasons,
    latestPriceCents: bestPriceFor(db, match.item),
  }));

  return {
    parsed,
    candidates,
    text,
    autoAcceptable: isAutoAcceptable(candidates, settings),
  };
}

/** Identify a card from a photo, running OCR first. */
export async function scanFromImage(
  db: Db,
  engine: OcrEngine,
  image: Buffer,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const text = await engine.recognize(image);
  return scanFromText(db, text, options);
}

/**
 * Auto-accept only when the winner is both strong on its own and clearly ahead
 * of the runner-up. Two printings of the same card scoring 0.95 and 0.94 is
 * exactly the case where guessing puts the wrong card in someone's collection.
 */
function isAutoAcceptable(
  candidates: readonly ScanCandidate[],
  settings: typeof DEFAULTS,
): boolean {
  const top = candidates[0];
  if (!top || top.score < settings.autoAcceptScore) return false;
  const runnerUp = candidates[1];
  if (!runnerUp) return true;
  return top.score - runnerUp.score >= settings.autoAcceptMargin;
}

/** Highest current price across the card's variants — a "from" figure. */
function bestPriceFor(db: Db, card: CardWithSet): number | null {
  const prices = getLatestPricesForCard(db, card.id);
  if (prices.length === 0) return null;
  return Math.max(...prices.map((price) => price.marketCents));
}
