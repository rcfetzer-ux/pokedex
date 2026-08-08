/**
 * Seed a fully populated local database from the offline fixture provider:
 * catalog, weeks of hourly price history, a sample collection, and the alerts
 * that history implies. Lets the apps be run and demoed with no network and no
 * API key.
 *
 *   npm run seed -w @pokedex/server -- --days 21 --reset
 */
import { rmSync } from 'node:fs';

import type { PricePoint, PriceVariant } from '@pokedex/shared';

import { loadConfig } from '../config.js';
import { openDatabase, type Db } from '../db/index.js';
import { FixtureProvider } from '../providers/index.js';
import { addInventoryItem } from '../repos/inventory.js';
import {
  insertSnapshots,
  listTrackedSeries,
  queryMovers,
  recomputeChanges,
} from '../repos/prices.js';
import { generateAlerts } from '../services/alerts.js';
import { syncCatalog } from '../services/catalog.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Recent history is hourly; older history thins out to keep the file small. */
const FINE_WINDOW_HOURS = 48;
const COARSE_STEP_HOURS = 6;

interface SeedArgs {
  days: number;
  reset: boolean;
}

function parseArgs(argv: readonly string[]): SeedArgs {
  const args: SeedArgs = { days: 21, reset: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--days' && argv[i + 1]) {
      args.days = Math.max(2, Number(argv[i + 1]));
      i += 1;
    } else if (arg === '--reset') {
      args.reset = true;
    }
  }
  return args;
}

function backfillTimestamps(now: number, days: number): number[] {
  const timestamps: number[] = [];
  const start = now - days * DAY_MS;
  const fineStart = now - FINE_WINDOW_HOURS * HOUR_MS;

  for (let ts = start; ts < fineStart; ts += COARSE_STEP_HOURS * HOUR_MS) timestamps.push(ts);
  for (let ts = fineStart; ts <= now; ts += HOUR_MS) timestamps.push(ts);

  return timestamps;
}

function backfillHistory(db: Db, provider: FixtureProvider, days: number, now: number): number {
  const series = listTrackedSeries(db);
  const timestamps = backfillTimestamps(now, days);

  let written = 0;
  // Chunked per series so each transaction stays a sensible size.
  for (const { cardId, variant } of series) {
    const points: PricePoint[] = [];
    for (const ts of timestamps) {
      const price = provider.priceAt(cardId, variant as PriceVariant, ts);
      if (!price) continue;
      points.push({
        cardId,
        variant: price.variant,
        ts,
        marketCents: price.marketCents,
        lowCents: price.lowCents,
        midCents: price.midCents,
        highCents: price.highCents,
        currency: price.currency,
        source: 'fixture',
      });
    }
    insertSnapshots(db, points);
    written += points.length;
  }
  return written;
}

/** A starter collection spanning eras, conditions and grading states. */
const SAMPLE_INVENTORY: {
  cardId: string;
  variant: PriceVariant;
  quantity: number;
  acquiredPriceCents: number;
  condition?: 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
  gradingCompany?: 'PSA' | 'BGS' | 'CGC' | 'SGC';
  grade?: number;
}[] = [
  { cardId: 'base1-4', variant: 'holofoil', quantity: 1, acquiredPriceCents: 28_000, condition: 'LP' },
  {
    cardId: 'base1-2',
    variant: 'holofoil',
    quantity: 1,
    acquiredPriceCents: 15_000,
    gradingCompany: 'PSA',
    grade: 8,
  },
  { cardId: 'base1-58', variant: 'normal', quantity: 3, acquiredPriceCents: 1_800 },
  { cardId: 'neo1-9', variant: 'holofoil', quantity: 1, acquiredPriceCents: 51_000, condition: 'NM' },
  { cardId: 'sv3pt5-199', variant: 'holofoil', quantity: 1, acquiredPriceCents: 24_500 },
  { cardId: 'sv3pt5-6', variant: 'holofoil', quantity: 4, acquiredPriceCents: 2_100 },
  { cardId: 'swsh12pt5-GG69', variant: 'holofoil', quantity: 1, acquiredPriceCents: 19_000 },
  { cardId: 'xy12-11', variant: 'holofoil', quantity: 2, acquiredPriceCents: 7_500 },
];

/** Buy into the biggest movers of the day, so the collection has live swings. */
function adoptTopMovers(db: Db, windowHours: number, count = 2): number {
  const movers = queryMovers(db, {
    windowHours,
    limit: count,
    minMagnitude: ['major', 'extreme'],
    excludeOwned: true,
    minPriceCents: 500,
  });

  for (const mover of movers) {
    addInventoryItem(db, {
      cardId: mover.cardId,
      variant: mover.variant,
      quantity: 1,
      // Bought at the pre-swing price, so gain/loss reflects the move.
      acquiredPriceCents: mover.change.fromCents,
    });
  }
  return movers.length;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig({ ...process.env, PRICE_PROVIDER: 'fixture' });

  if (args.reset) {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${config.databasePath}${suffix}`, { force: true });
    }
    console.log(`reset ${config.databasePath}`);
  }

  const db = openDatabase(config.databasePath);
  const provider = new FixtureProvider();
  const now = Date.now();

  console.log('syncing fixture catalog…');
  const sync = await syncCatalog(db, provider, { now, ingestPrices: true });
  console.log(`  ${sync.sets} sets, ${sync.cards} cards`);

  console.log(`backfilling ${args.days} days of price history…`);
  const points = backfillHistory(db, provider, args.days, now);
  console.log(`  ${points} snapshots`);

  console.log('computing swings…');
  const changes = recomputeChanges(db, config.swingWindowsHours, {
    thresholds: config.thresholds,
    now,
  });
  console.log(`  ${changes} change rows`);

  console.log('adding sample collection…');
  for (const entry of SAMPLE_INVENTORY) {
    try {
      addInventoryItem(db, {
        cardId: entry.cardId,
        variant: entry.variant,
        quantity: entry.quantity,
        acquiredPriceCents: entry.acquiredPriceCents,
        condition: entry.condition ?? 'NM',
        gradingCompany: entry.gradingCompany ?? null,
        grade: entry.grade ?? null,
      });
    } catch (error) {
      // A fixture id that drifted out of the dataset should not abort the seed.
      console.warn(`  skipped ${entry.cardId}: ${(error as Error).message}`);
    }
  }

  // Whether any *particular* card swung today is random, so a fixed sample
  // collection usually holds nothing that moved and the alert feed seeds
  // empty. Adopting a couple of today's real movers keeps the demo honest —
  // the alerts are still produced by the ordinary engine — while guaranteeing
  // there is something to look at.
  const adopted = adoptTopMovers(db, config.swingWindowsHours[0] ?? 24);
  console.log(`  ${SAMPLE_INVENTORY.length} fixed holdings + ${adopted} of today's movers`);

  const alerts = generateAlerts(db, config, { now });
  console.log(`  ${alerts.length} alerts raised`);

  db.close();
  console.log(`\ndone — ${config.databasePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
