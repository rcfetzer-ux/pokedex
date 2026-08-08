import type { Alert, PricePoint } from '@pokedex/shared';

import type { Config } from '../config.js';
import { setMeta, type Db } from '../db/index.js';
import type { CardDataProvider } from '../providers/index.js';
import { listSets } from '../repos/cards.js';
import { insertSnapshots, pruneHistory, recomputeChanges } from '../repos/prices.js';
import { generateAlerts } from './alerts.js';

export interface RefreshResult {
  sets: number;
  snapshots: number;
  changes: number;
  alerts: Alert[];
  pruned: number;
  failedSets: { setId: string; error: string }[];
  durationMs: number;
}

export interface RefreshOptions {
  now?: number;
  setIds?: string[];
  /** Skip alert generation (used by the seed backfill). */
  skipAlerts?: boolean;
}

/**
 * The heartbeat of the value tracker: pull current prices, append them to
 * history, recompute the trailing-window changes, then raise alerts.
 *
 * Order matters — alerts read the materialized change table, so it has to be
 * rebuilt before they are generated.
 */
export async function refreshPrices(
  db: Db,
  provider: CardDataProvider,
  config: Config,
  options: RefreshOptions = {},
): Promise<RefreshResult> {
  const startedAt = Date.now();
  const now = options.now ?? startedAt;

  const sets = listSets(db).filter(
    (set) => !options.setIds?.length || options.setIds.includes(set.id),
  );

  const result: RefreshResult = {
    sets: 0,
    snapshots: 0,
    changes: 0,
    alerts: [],
    pruned: 0,
    failedSets: [],
    durationMs: 0,
  };

  for (const set of sets) {
    if (config.priceRefreshLimit > 0 && result.snapshots >= config.priceRefreshLimit) break;

    try {
      const cards = await provider.listCards(set.id);
      const points: PricePoint[] = [];

      for (const entry of cards) {
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
      result.snapshots += points.length;
      result.sets += 1;
    } catch (error) {
      result.failedSets.push({
        setId: set.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  result.changes = recomputeChanges(db, config.swingWindowsHours, {
    thresholds: config.thresholds,
    now,
  });

  if (!options.skipAlerts) {
    result.alerts = generateAlerts(db, config, { now });
  }

  const retentionMs = config.historyRetentionDays * 24 * 60 * 60 * 1000;
  result.pruned = pruneHistory(db, now - retentionMs);

  setMeta(db, 'prices:last_refresh_at', String(now));
  result.durationMs = Date.now() - startedAt;
  return result;
}
