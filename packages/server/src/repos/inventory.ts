import { randomUUID } from 'node:crypto';

import {
  isPriceVariant,
  type Condition,
  type GradingCompany,
  type InventoryItem,
  type PriceVariant,
} from '@pokedex/shared';

import type { Db } from '../db/index.js';

interface InventoryRow {
  id: string;
  card_id: string;
  variant: string;
  condition: string;
  grading_company: string | null;
  grade: number | null;
  quantity: number;
  acquired_price_cents: number | null;
  acquired_at: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

function mapRow(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    cardId: row.card_id,
    variant: (isPriceVariant(row.variant) ? row.variant : 'normal') as PriceVariant,
    condition: row.condition as Condition,
    gradingCompany: row.grading_company as GradingCompany | null,
    grade: row.grade,
    quantity: row.quantity,
    acquiredPriceCents: row.acquired_price_cents,
    acquiredAt: row.acquired_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateInventoryInput {
  cardId: string;
  variant: PriceVariant;
  condition?: Condition;
  gradingCompany?: GradingCompany | null;
  grade?: number | null;
  quantity?: number;
  acquiredPriceCents?: number | null;
  acquiredAt?: string | null;
  notes?: string | null;
}

/**
 * Adding a card the user already holds in the same printing, condition and
 * grade bumps the quantity instead of creating a second row — scanning a
 * playset of the same card should read as "4x", not four separate entries.
 */
export function addInventoryItem(db: Db, input: CreateInventoryInput): InventoryItem {
  const now = Date.now();
  const condition = input.condition ?? 'NM';
  const gradingCompany = input.gradingCompany ?? null;
  const grade = input.grade ?? null;
  const quantity = Math.max(1, Math.trunc(input.quantity ?? 1));

  const existing = db
    .prepare(
      `SELECT * FROM inventory
       WHERE card_id = ? AND variant = ? AND condition = ?
         AND grading_company IS ? AND grade IS ?
         AND acquired_price_cents IS ?
       LIMIT 1`,
    )
    .get(
      input.cardId,
      input.variant,
      condition,
      gradingCompany,
      grade,
      input.acquiredPriceCents ?? null,
    ) as InventoryRow | undefined;

  if (existing) {
    db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = ? WHERE id = ?').run(
      quantity,
      now,
      existing.id,
    );
    return getInventoryItem(db, existing.id)!;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO inventory (id, card_id, variant, condition, grading_company, grade,
                            quantity, acquired_price_cents, acquired_at, notes,
                            created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.cardId,
    input.variant,
    condition,
    gradingCompany,
    grade,
    quantity,
    input.acquiredPriceCents ?? null,
    input.acquiredAt ?? null,
    input.notes ?? null,
    now,
    now,
  );

  return getInventoryItem(db, id)!;
}

export function getInventoryItem(db: Db, id: string): InventoryItem | null {
  const row = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) as
    | InventoryRow
    | undefined;
  return row ? mapRow(row) : null;
}

export function listInventory(db: Db): InventoryItem[] {
  const rows = db
    .prepare('SELECT * FROM inventory ORDER BY created_at DESC')
    .all() as InventoryRow[];
  return rows.map(mapRow);
}

export type UpdateInventoryInput = Partial<
  Pick<
    InventoryItem,
    | 'variant'
    | 'condition'
    | 'gradingCompany'
    | 'grade'
    | 'quantity'
    | 'acquiredPriceCents'
    | 'acquiredAt'
    | 'notes'
  >
>;

const UPDATE_COLUMNS: Record<keyof UpdateInventoryInput, string> = {
  variant: 'variant',
  condition: 'condition',
  gradingCompany: 'grading_company',
  grade: 'grade',
  quantity: 'quantity',
  acquiredPriceCents: 'acquired_price_cents',
  acquiredAt: 'acquired_at',
  notes: 'notes',
};

export function updateInventoryItem(
  db: Db,
  id: string,
  input: UpdateInventoryInput,
): InventoryItem | null {
  const assignments: string[] = [];
  const params: unknown[] = [];

  for (const [key, column] of Object.entries(UPDATE_COLUMNS)) {
    const value = input[key as keyof UpdateInventoryInput];
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(value);
  }

  if (assignments.length === 0) return getInventoryItem(db, id);

  assignments.push('updated_at = ?');
  params.push(Date.now(), id);

  db.prepare(`UPDATE inventory SET ${assignments.join(', ')} WHERE id = ?`).run(...params);
  return getInventoryItem(db, id);
}

export function deleteInventoryItem(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM inventory WHERE id = ?').run(id).changes > 0;
}

/** Distinct card+variant pairs held, used to scope inventory swing checks. */
export function listOwnedSeries(db: Db): { cardId: string; variant: PriceVariant; quantity: number }[] {
  const rows = db
    .prepare(
      `SELECT card_id, variant, SUM(quantity) AS quantity
       FROM inventory GROUP BY card_id, variant`,
    )
    .all() as { card_id: string; variant: string; quantity: number }[];

  return rows
    .filter((row) => isPriceVariant(row.variant))
    .map((row) => ({
      cardId: row.card_id,
      variant: row.variant as PriceVariant,
      quantity: row.quantity,
    }));
}
