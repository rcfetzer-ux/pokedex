import { randomUUID } from 'node:crypto';

import type { Alert, AlertKind, PriceVariant, SwingDirection, SwingMagnitude } from '@pokedex/shared';

import type { Db } from '../db/index.js';

interface AlertRow {
  id: string;
  kind: string;
  card_id: string;
  variant: string;
  window_hours: number;
  from_cents: number;
  to_cents: number;
  change_cents: number;
  change_ratio: number;
  direction: string;
  magnitude: string;
  title: string;
  body: string;
  created_at: number;
  read_at: number | null;
  pushed_at: number | null;
}

function mapRow(row: AlertRow): Alert {
  return {
    id: row.id,
    kind: row.kind as AlertKind,
    cardId: row.card_id,
    variant: row.variant as PriceVariant,
    windowHours: row.window_hours,
    fromCents: row.from_cents,
    toCents: row.to_cents,
    changeCents: row.change_cents,
    changeRatio: row.change_ratio,
    direction: row.direction as SwingDirection,
    magnitude: row.magnitude as SwingMagnitude,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
    pushedAt: row.pushed_at,
  };
}

export type CreateAlertInput = Omit<Alert, 'id' | 'createdAt' | 'readAt' | 'pushedAt'>;

export function insertAlert(db: Db, input: CreateAlertInput): Alert {
  const id = randomUUID();
  const createdAt = Date.now();

  db.prepare(
    `INSERT INTO alerts (id, kind, card_id, variant, window_hours, from_cents, to_cents,
                         change_cents, change_ratio, direction, magnitude, title, body,
                         created_at, read_at, pushed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
  ).run(
    id,
    input.kind,
    input.cardId,
    input.variant,
    input.windowHours,
    input.fromCents,
    input.toCents,
    input.changeCents,
    input.changeRatio,
    input.direction,
    input.magnitude,
    input.title,
    input.body,
    createdAt,
  );

  return { ...input, id, createdAt, readAt: null, pushedAt: null };
}

/**
 * The most recent alert for this series, used for cooldown. A 30% swing stays
 * a 30% swing for the whole trailing window, so without this the same move
 * would re-alert on every refresh until it aged out.
 */
export function findLatestAlert(
  db: Db,
  cardId: string,
  variant: PriceVariant,
  kind: AlertKind,
  windowHours: number,
): Alert | null {
  const row = db
    .prepare(
      `SELECT * FROM alerts
       WHERE card_id = ? AND variant = ? AND kind = ? AND window_hours = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(cardId, variant, kind, windowHours) as AlertRow | undefined;
  return row ? mapRow(row) : null;
}

export interface ListAlertsOptions {
  limit?: number;
  unreadOnly?: boolean;
  kind?: AlertKind;
}

export function listAlerts(db: Db, options: ListAlertsOptions = {}): Alert[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.unreadOnly) clauses.push('read_at IS NULL');
  if (options.kind) {
    clauses.push('kind = ?');
    params.push(options.kind);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, Math.min(options.limit ?? 100, 500)) as AlertRow[];

  return rows.map(mapRow);
}

export function listUnpushedAlerts(db: Db, limit = 50): Alert[] {
  const rows = db
    .prepare('SELECT * FROM alerts WHERE pushed_at IS NULL ORDER BY created_at ASC LIMIT ?')
    .all(limit) as AlertRow[];
  return rows.map(mapRow);
}

export function markAlertsPushed(db: Db, ids: readonly string[]): void {
  if (ids.length === 0) return;
  const statement = db.prepare('UPDATE alerts SET pushed_at = ? WHERE id = ?');
  const now = Date.now();
  const run = db.transaction((rows: readonly string[]) => {
    for (const id of rows) statement.run(now, id);
  });
  run(ids);
}

export function markAlertRead(db: Db, id: string): boolean {
  return db.prepare('UPDATE alerts SET read_at = ? WHERE id = ? AND read_at IS NULL').run(
    Date.now(),
    id,
  ).changes > 0;
}

export function markAllAlertsRead(db: Db): number {
  return db.prepare('UPDATE alerts SET read_at = ? WHERE read_at IS NULL').run(Date.now()).changes;
}

export function countUnreadAlerts(db: Db): number {
  return (
    db.prepare('SELECT COUNT(*) AS count FROM alerts WHERE read_at IS NULL').get() as {
      count: number;
    }
  ).count;
}
