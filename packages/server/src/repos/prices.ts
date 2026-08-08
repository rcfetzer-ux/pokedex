import {
  computeSeriesChange,
  isPriceVariant,
  type PriceChange,
  type PricePoint,
  type PriceVariant,
  type SwingThresholds,
} from '@pokedex/shared';

import type { Db } from '../db/index.js';

interface SnapshotRow {
  card_id: string;
  variant: string;
  ts: number;
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  currency: string;
  source: string;
}

interface ChangeRow {
  card_id: string;
  variant: string;
  window_hours: number;
  from_ts: number;
  from_cents: number;
  to_ts: number;
  to_cents: number;
  change_cents: number;
  change_ratio: number;
  direction: string;
  magnitude: string;
}

function mapSnapshotRow(row: SnapshotRow): PricePoint {
  return {
    cardId: row.card_id,
    variant: (isPriceVariant(row.variant) ? row.variant : 'normal') as PriceVariant,
    ts: row.ts,
    marketCents: row.market_cents,
    lowCents: row.low_cents,
    midCents: row.mid_cents,
    highCents: row.high_cents,
    currency: row.currency,
    source: row.source,
  };
}

function mapChangeRow(row: ChangeRow): PriceChange {
  return {
    fromCents: row.from_cents,
    toCents: row.to_cents,
    changeCents: row.change_cents,
    changeRatio: row.change_ratio,
    direction: row.direction as PriceChange['direction'],
    magnitude: row.magnitude as PriceChange['magnitude'],
    windowHours: row.window_hours,
    fromTs: row.from_ts,
    toTs: row.to_ts,
  };
}

export function insertSnapshots(db: Db, points: readonly PricePoint[]): number {
  const snapshot = db.prepare(`
    INSERT INTO price_snapshots (card_id, variant, ts, market_cents, low_cents,
                                 mid_cents, high_cents, currency, source)
    VALUES (@cardId, @variant, @ts, @marketCents, @lowCents, @midCents,
            @highCents, @currency, @source)
    ON CONFLICT(card_id, variant, ts) DO UPDATE SET
      market_cents = excluded.market_cents,
      low_cents = excluded.low_cents,
      mid_cents = excluded.mid_cents,
      high_cents = excluded.high_cents
  `);

  // `latest` is only advanced when the incoming point is newer, so a backfill
  // of older history can never overwrite the current price.
  const latest = db.prepare(`
    INSERT INTO card_price_latest (card_id, variant, ts, market_cents, low_cents,
                                   mid_cents, high_cents, currency, source)
    VALUES (@cardId, @variant, @ts, @marketCents, @lowCents, @midCents,
            @highCents, @currency, @source)
    ON CONFLICT(card_id, variant) DO UPDATE SET
      ts = excluded.ts,
      market_cents = excluded.market_cents,
      low_cents = excluded.low_cents,
      mid_cents = excluded.mid_cents,
      high_cents = excluded.high_cents,
      currency = excluded.currency,
      source = excluded.source
    WHERE excluded.ts > card_price_latest.ts
  `);

  const run = db.transaction((rows: readonly PricePoint[]) => {
    for (const point of rows) {
      snapshot.run(point);
      latest.run(point);
    }
  });
  run(points);
  return points.length;
}

export function getHistory(
  db: Db,
  cardId: string,
  variant: PriceVariant,
  sinceTs = 0,
): PricePoint[] {
  const rows = db
    .prepare(
      `SELECT * FROM price_snapshots
       WHERE card_id = ? AND variant = ? AND ts >= ?
       ORDER BY ts ASC`,
    )
    .all(cardId, variant, sinceTs) as SnapshotRow[];
  return rows.map(mapSnapshotRow);
}

export function getLatestPrice(
  db: Db,
  cardId: string,
  variant: PriceVariant,
): PricePoint | null {
  const row = db
    .prepare('SELECT * FROM card_price_latest WHERE card_id = ? AND variant = ?')
    .get(cardId, variant) as SnapshotRow | undefined;
  return row ? mapSnapshotRow(row) : null;
}

export function getLatestPricesForCard(db: Db, cardId: string): PricePoint[] {
  const rows = db
    .prepare('SELECT * FROM card_price_latest WHERE card_id = ?')
    .all(cardId) as SnapshotRow[];
  return rows.map(mapSnapshotRow);
}

/** Every card+variant that has at least one recorded price. */
export function listTrackedSeries(db: Db): { cardId: string; variant: PriceVariant }[] {
  const rows = db
    .prepare('SELECT card_id, variant FROM card_price_latest')
    .all() as { card_id: string; variant: string }[];
  return rows
    .filter((row) => isPriceVariant(row.variant))
    .map((row) => ({ cardId: row.card_id, variant: row.variant as PriceVariant }));
}

export function getChange(
  db: Db,
  cardId: string,
  variant: PriceVariant,
  windowHours: number,
): PriceChange | null {
  const row = db
    .prepare(
      'SELECT * FROM card_price_change WHERE card_id = ? AND variant = ? AND window_hours = ?',
    )
    .get(cardId, variant, windowHours) as ChangeRow | undefined;
  return row ? mapChangeRow(row) : null;
}

export interface StoredChange extends PriceChange {
  cardId: string;
  variant: PriceVariant;
}

export function upsertChanges(db: Db, changes: readonly StoredChange[]): void {
  const statement = db.prepare(`
    INSERT INTO card_price_change (card_id, variant, window_hours, from_ts, from_cents,
                                   to_ts, to_cents, change_cents, change_ratio,
                                   direction, magnitude, computed_at)
    VALUES (@cardId, @variant, @windowHours, @fromTs, @fromCents, @toTs, @toCents,
            @changeCents, @changeRatio, @direction, @magnitude, @computedAt)
    ON CONFLICT(card_id, variant, window_hours) DO UPDATE SET
      from_ts = excluded.from_ts,
      from_cents = excluded.from_cents,
      to_ts = excluded.to_ts,
      to_cents = excluded.to_cents,
      change_cents = excluded.change_cents,
      change_ratio = excluded.change_ratio,
      direction = excluded.direction,
      magnitude = excluded.magnitude,
      computed_at = excluded.computed_at
  `);

  const computedAt = Date.now();
  const run = db.transaction((rows: readonly StoredChange[]) => {
    for (const change of rows) statement.run({ ...change, computedAt });
  });
  run(changes);
}

/** Drop stale rows for series whose window no longer has a usable baseline. */
export function deleteChanges(
  db: Db,
  keys: readonly { cardId: string; variant: PriceVariant; windowHours: number }[],
): void {
  const statement = db.prepare(
    'DELETE FROM card_price_change WHERE card_id = ? AND variant = ? AND window_hours = ?',
  );
  const run = db.transaction((rows: typeof keys) => {
    for (const key of rows) statement.run(key.cardId, key.variant, key.windowHours);
  });
  run(keys);
}

/**
 * Recompute the trailing-window change for every tracked series. Called after
 * each price ingest; the results are what /movers and the alert engine read.
 */
export function recomputeChanges(
  db: Db,
  windowsHours: readonly number[],
  options: { thresholds?: SwingThresholds; now?: number } = {},
): number {
  const now = options.now ?? Date.now();
  const series = listTrackedSeries(db);

  const updates: StoredChange[] = [];
  const removals: { cardId: string; variant: PriceVariant; windowHours: number }[] = [];

  for (const { cardId, variant } of series) {
    const maxWindow = Math.max(...windowsHours);
    // One read per series covering the widest window, sliced per window below.
    const history = getHistory(db, cardId, variant, now - maxWindow * 60 * 60 * 1000 * 2);

    for (const windowHours of windowsHours) {
      const change = computeSeriesChange(history, windowHours, {
        now,
        thresholds: options.thresholds,
      });
      if (change) updates.push({ ...change, cardId, variant });
      else removals.push({ cardId, variant, windowHours });
    }
  }

  upsertChanges(db, updates);
  deleteChanges(db, removals);
  return updates.length;
}

export interface MoverQuery {
  windowHours: number;
  limit?: number;
  /** Exclude card+variant pairs the user already owns. */
  excludeOwned?: boolean;
  minPriceCents?: number;
  direction?: 'up' | 'down' | 'both';
  minMagnitude?: string[];
}

export interface MoverRow {
  cardId: string;
  variant: PriceVariant;
  change: PriceChange;
}

export function queryMovers(db: Db, query: MoverQuery): MoverRow[] {
  const limit = Math.min(query.limit ?? 25, 100);
  const clauses = ['ch.window_hours = ?'];
  const params: unknown[] = [query.windowHours];

  if (query.minPriceCents != null) {
    clauses.push('ch.to_cents >= ?');
    params.push(query.minPriceCents);
  }
  if (query.direction && query.direction !== 'both') {
    clauses.push('ch.direction = ?');
    params.push(query.direction);
  }
  if (query.minMagnitude && query.minMagnitude.length > 0) {
    clauses.push(`ch.magnitude IN (${query.minMagnitude.map(() => '?').join(',')})`);
    params.push(...query.minMagnitude);
  }
  if (query.excludeOwned) {
    clauses.push(
      'NOT EXISTS (SELECT 1 FROM inventory i WHERE i.card_id = ch.card_id AND i.variant = ch.variant)',
    );
  }

  const rows = db
    .prepare(
      `SELECT ch.* FROM card_price_change ch
       WHERE ${clauses.join(' AND ')}
       ORDER BY ABS(ch.change_ratio) DESC
       LIMIT ?`,
    )
    .all(...params, limit) as ChangeRow[];

  return rows.map((row) => ({
    cardId: row.card_id,
    variant: (isPriceVariant(row.variant) ? row.variant : 'normal') as PriceVariant,
    change: mapChangeRow(row),
  }));
}

/** Prune history beyond the retention horizon to bound database growth. */
export function pruneHistory(db: Db, olderThanTs: number): number {
  const result = db.prepare('DELETE FROM price_snapshots WHERE ts < ?').run(olderThanTs);
  return result.changes;
}
