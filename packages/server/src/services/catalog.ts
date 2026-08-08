import type { PricePoint, PriceVariant } from '@pokedex/shared';

import type { Db } from '../db/index.js';
import { setMeta } from '../db/index.js';
import type { CardDataProvider } from '../providers/index.js';
import { upsertCards, upsertSets, type CardUpsert } from '../repos/cards.js';
import { insertSnapshots } from '../repos/prices.js';

export interface SyncProgress {
  setId: string;
  setName: string;
  index: number;
  total: number;
  cards: number;
}

export interface SyncResult {
  sets: number;
  cards: number;
  prices: number;
  failedSets: { setId: string; error: string }[];
}

export interface SyncOptions {
  onProgress?: (progress: SyncProgress) => void;
  /** Restrict to specific sets; omit to sync every set the provider knows. */
  setIds?: string[];
  /** Record the prices returned alongside the catalog as a first snapshot. */
  ingestPrices?: boolean;
  now?: number;
}

/**
 * Pull the full catalog — every set, every card — into the local database.
 *
 * One failing set does not abort the run: with ~170 sets behind a rate-limited
 * API, aborting would mean a single blip costs the entire sync. Failures are
 * collected and reported so they can be retried.
 */
export async function syncCatalog(
  db: Db,
  provider: CardDataProvider,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const now = options.now ?? Date.now();
  const ingestPrices = options.ingestPrices ?? true;

  const allSets = await provider.listSets();
  const sets = options.setIds?.length
    ? allSets.filter((set) => options.setIds!.includes(set.id))
    : allSets;

  upsertSets(db, sets);

  const result: SyncResult = { sets: sets.length, cards: 0, prices: 0, failedSets: [] };

  for (const [index, set] of sets.entries()) {
    try {
      const providerCards = await provider.listCards(set.id);

      const cards: CardUpsert[] = providerCards.map((entry) => ({
        ...entry.card,
        variants: entry.prices.map((price) => price.variant),
      }));
      upsertCards(db, cards);
      result.cards += cards.length;

      if (ingestPrices) {
        const points: PricePoint[] = [];
        for (const entry of providerCards) {
          for (const price of entry.prices) {
            points.push({
              cardId: entry.card.id,
              variant: price.variant,
              ts: now,
              marketCents: price.marketCents,
              lowCents: price.lowCents,
              midCents: price.midCents,
              highCents: price.highCents,
              currency: price.currency,
              source: provider.name,
            });
          }
        }
        insertSnapshots(db, points);
        result.prices += points.length;
      }

      options.onProgress?.({
        setId: set.id,
        setName: set.name,
        index: index + 1,
        total: sets.length,
        cards: cards.length,
      });
    } catch (error) {
      result.failedSets.push({
        setId: set.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  setMeta(db, 'catalog:last_sync_at', String(now));
  setMeta(db, 'catalog:provider', provider.name);
  return result;
}

/** Variants a card is priced in, per the provider payload. */
export function variantsOf(prices: readonly { variant: PriceVariant }[]): PriceVariant[] {
  return [...new Set(prices.map((price) => price.variant))];
}
