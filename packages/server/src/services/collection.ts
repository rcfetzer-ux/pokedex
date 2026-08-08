import type { InventoryItemWithValue, PriceChange } from '@pokedex/shared';

import type { Db } from '../db/index.js';
import { getCards } from '../repos/cards.js';
import { listInventory } from '../repos/inventory.js';
import { getChange, getLatestPrice } from '../repos/prices.js';

export interface CollectionSummary {
  items: number;
  copies: number;
  distinctCards: number;
  totalValueCents: number;
  /** Only counts copies with a known acquisition price. */
  totalCostCents: number;
  gainCents: number;
  /** Sum of the 24h move across every copy held. */
  change24hCents: number;
  /** Number of copies whose value could not be determined. */
  unpricedCopies: number;
}

export interface CollectionResponse {
  items: InventoryItemWithValue[];
  summary: CollectionSummary;
}

export function getCollection(db: Db, windowHours = 24): CollectionResponse {
  const items = listInventory(db);
  const cards = getCards(db, [...new Set(items.map((item) => item.cardId))]);

  const enriched: InventoryItemWithValue[] = [];
  const summary: CollectionSummary = {
    items: items.length,
    copies: 0,
    distinctCards: 0,
    totalValueCents: 0,
    totalCostCents: 0,
    gainCents: 0,
    change24hCents: 0,
    unpricedCopies: 0,
  };

  const distinct = new Set<string>();

  for (const item of items) {
    const card = cards.get(item.cardId);
    // A row whose card vanished from the catalog is skipped rather than
    // rendered half-empty; a re-sync restores it.
    if (!card) continue;

    distinct.add(item.cardId);
    summary.copies += item.quantity;

    const price = getLatestPrice(db, item.cardId, item.variant);
    const unitValueCents = price?.marketCents ?? null;
    const totalValueCents = unitValueCents == null ? null : unitValueCents * item.quantity;

    const gainCents =
      totalValueCents == null || item.acquiredPriceCents == null
        ? null
        : totalValueCents - item.acquiredPriceCents * item.quantity;

    const change: PriceChange | null = getChange(db, item.cardId, item.variant, windowHours);

    if (totalValueCents == null) {
      summary.unpricedCopies += item.quantity;
    } else {
      summary.totalValueCents += totalValueCents;
    }
    if (item.acquiredPriceCents != null) {
      summary.totalCostCents += item.acquiredPriceCents * item.quantity;
    }
    if (gainCents != null) summary.gainCents += gainCents;
    if (change) summary.change24hCents += change.changeCents * item.quantity;

    enriched.push({
      ...item,
      card,
      unitValueCents,
      totalValueCents,
      gainCents,
      change24h: change,
    });
  }

  summary.distinctCards = distinct.size;

  // Most valuable holdings first; unpriced rows sink to the bottom.
  enriched.sort((a, b) => (b.totalValueCents ?? -1) - (a.totalValueCents ?? -1));

  return { items: enriched, summary };
}
