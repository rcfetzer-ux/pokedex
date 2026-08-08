import {
  composeAlertCopy,
  magnitudeRank,
  meetsMagnitude,
  type Alert,
  type AlertKind,
  type PriceVariant,
  type SwingMagnitude,
} from '@pokedex/shared';

import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { findLatestAlert, insertAlert } from '../repos/alerts.js';
import { getCards } from '../repos/cards.js';
import { listOwnedSeries } from '../repos/inventory.js';
import { getChange, queryMovers } from '../repos/prices.js';

export interface GenerateAlertsOptions {
  now?: number;
}

/**
 * Turn freshly computed price changes into alerts.
 *
 * Runs after every price refresh. Inventory swings always alert; market-wide
 * swings on cards the user does not own are surfaced in the movers list by
 * default and only alert when explicitly enabled, because "every card in the
 * hobby that moved 20% today" is a feed, not a notification.
 */
export function generateAlerts(db: Db, config: Config, options: GenerateAlertsOptions = {}): Alert[] {
  const now = options.now ?? Date.now();
  const windowHours = config.swingWindowsHours[0] ?? 24;
  const cooldownMs = config.alertCooldownHours * 60 * 60 * 1000;
  const created: Alert[] = [];

  const owned = listOwnedSeries(db);
  const ownedCards = getCards(db, [...new Set(owned.map((entry) => entry.cardId))]);

  for (const entry of owned) {
    const change = getChange(db, entry.cardId, entry.variant, windowHours);
    if (!change || !meetsMagnitude(change.magnitude, config.notifyAtOrAbove)) continue;

    if (isInCooldown(db, entry.cardId, entry.variant, 'inventory_swing', windowHours, change.magnitude, now, cooldownMs)) {
      continue;
    }

    const card = ownedCards.get(entry.cardId);
    if (!card) continue;

    const copy = composeAlertCopy({
      kind: 'inventory_swing',
      cardName: card.name,
      setName: card.set.name,
      variant: entry.variant,
      change,
      quantity: entry.quantity,
    });

    created.push(
      insertAlert(db, {
        kind: 'inventory_swing',
        cardId: entry.cardId,
        variant: entry.variant,
        windowHours,
        fromCents: change.fromCents,
        toCents: change.toCents,
        changeCents: change.changeCents,
        changeRatio: change.changeRatio,
        direction: change.direction,
        magnitude: change.magnitude,
        title: copy.title,
        body: copy.body,
      }),
    );
  }

  if (config.notifyOnMarketMovers) {
    const movers = queryMovers(db, {
      windowHours,
      excludeOwned: true,
      minPriceCents: config.moversMinPriceCents,
      limit: config.marketAlertLimit,
    });
    const moverCards = getCards(db, [...new Set(movers.map((mover) => mover.cardId))]);

    for (const mover of movers) {
      if (!meetsMagnitude(mover.change.magnitude, config.marketAlertMinMagnitude)) continue;
      if (isInCooldown(db, mover.cardId, mover.variant, 'market_swing', windowHours, mover.change.magnitude, now, cooldownMs)) {
        continue;
      }

      const card = moverCards.get(mover.cardId);
      if (!card) continue;

      const copy = composeAlertCopy({
        kind: 'market_swing',
        cardName: card.name,
        setName: card.set.name,
        variant: mover.variant,
        change: mover.change,
      });

      created.push(
        insertAlert(db, {
          kind: 'market_swing',
          cardId: mover.cardId,
          variant: mover.variant,
          windowHours,
          fromCents: mover.change.fromCents,
          toCents: mover.change.toCents,
          changeCents: mover.change.changeCents,
          changeRatio: mover.change.changeRatio,
          direction: mover.change.direction,
          magnitude: mover.change.magnitude,
          title: copy.title,
          body: copy.body,
        }),
      );
    }
  }

  return created;
}

/**
 * True when we already told the user about this move recently. An escalation
 * (major -> extreme) breaks through the cooldown, because that genuinely is
 * new information.
 */
function isInCooldown(
  db: Db,
  cardId: string,
  variant: PriceVariant,
  kind: AlertKind,
  windowHours: number,
  magnitude: SwingMagnitude,
  now: number,
  cooldownMs: number,
): boolean {
  const previous = findLatestAlert(db, cardId, variant, kind, windowHours);
  if (!previous) return false;
  if (now - previous.createdAt >= cooldownMs) return false;
  return magnitudeRank(magnitude) <= magnitudeRank(previous.magnitude);
}
