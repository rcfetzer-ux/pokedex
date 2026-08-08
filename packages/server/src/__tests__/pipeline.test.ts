import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { addInventoryItem, listOwnedSeries } from '../repos/inventory.js';
import { getChange, getLatestPrice, insertSnapshots, queryMovers } from '../repos/prices.js';
import { generateAlerts } from '../services/alerts.js';
import { syncCatalog } from '../services/catalog.js';
import { getCollection } from '../services/collection.js';
import { refreshPrices } from '../services/prices.js';
import { HOUR_MS, createTestContext, type TestContext } from './helpers.js';

describe('price pipeline', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = createTestContext();
    await syncCatalog(context.db, context.provider, { ingestPrices: false });
  });

  afterEach(() => context.close());

  it('syncs the catalog and records prices on refresh', async () => {
    const now = Date.now();
    const result = await refreshPrices(context.db, context.provider, context.config, { now });

    assert.equal(result.sets, 2);
    assert.equal(result.snapshots, 6);
    assert.equal(getLatestPrice(context.db, 'base1-4', 'holofoil')?.marketCents, 1_000);
  });

  it('computes a 24h change across two refreshes', async () => {
    const now = Date.now();
    await refreshPrices(context.db, context.provider, context.config, { now: now - 25 * HOUR_MS });

    context.provider.setPrice('base1-4', 'holofoil', 1_400);
    await refreshPrices(context.db, context.provider, context.config, { now });

    const change = getChange(context.db, 'base1-4', 'holofoil', 24);
    assert.ok(change);
    assert.equal(change.fromCents, 1_000);
    assert.equal(change.toCents, 1_400);
    assert.equal(change.changeCents, 400);
    assert.equal(change.magnitude, 'major');
    assert.equal(change.direction, 'up');
  });

  it('does not let a backfilled older snapshot overwrite the current price', () => {
    const now = Date.now();
    insertSnapshots(context.db, [
      {
        cardId: 'base1-4',
        variant: 'holofoil',
        ts: now,
        marketCents: 5_000,
        lowCents: null,
        midCents: null,
        highCents: null,
        currency: 'USD',
        source: 'test',
      },
    ]);
    insertSnapshots(context.db, [
      {
        cardId: 'base1-4',
        variant: 'holofoil',
        ts: now - 10 * HOUR_MS,
        marketCents: 1,
        lowCents: null,
        midCents: null,
        highCents: null,
        currency: 'USD',
        source: 'test',
      },
    ]);

    assert.equal(getLatestPrice(context.db, 'base1-4', 'holofoil')?.marketCents, 5_000);
  });
});

describe('alerts', () => {
  let context: TestContext;

  async function movePrice(cardId: string, from: number, to: number, now: number): Promise<void> {
    context.provider.setPrice(cardId, 'holofoil', from);
    await refreshPrices(context.db, context.provider, context.config, {
      now: now - 25 * HOUR_MS,
      skipAlerts: true,
    });
    context.provider.setPrice(cardId, 'holofoil', to);
    await refreshPrices(context.db, context.provider, context.config, { now, skipAlerts: true });
  }

  beforeEach(async () => {
    context = createTestContext();
    await syncCatalog(context.db, context.provider, { ingestPrices: false });
  });

  afterEach(() => context.close());

  it('raises an alert for a major swing on a card you own', async () => {
    const now = Date.now();
    addInventoryItem(context.db, { cardId: 'base1-4', variant: 'holofoil', quantity: 2 });
    await movePrice('base1-4', 1_000, 1_500, now);

    const alerts = generateAlerts(context.db, context.config, { now });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]?.kind, 'inventory_swing');
    assert.equal(alerts[0]?.cardId, 'base1-4');
    assert.match(alerts[0]?.title ?? '', /\+50\.0%/);
    // Body reports the position move, not just the per-card move.
    assert.match(alerts[0]?.body ?? '', /your 2 copies up \$10\.00/);
  });

  it('stays silent for a swing on a card you do not own', async () => {
    const now = Date.now();
    await movePrice('base1-4', 1_000, 1_500, now);

    assert.deepEqual(generateAlerts(context.db, context.config, { now }), []);
  });

  it('does not re-alert the same swing on the next refresh', async () => {
    const now = Date.now();
    addInventoryItem(context.db, { cardId: 'base1-4', variant: 'holofoil', quantity: 1 });
    await movePrice('base1-4', 1_000, 1_500, now);

    assert.equal(generateAlerts(context.db, context.config, { now }).length, 1);
    // Same move, one hour later: still a 50% 24h swing, but not new news.
    assert.equal(generateAlerts(context.db, context.config, { now: now + HOUR_MS }).length, 0);
  });

  it('breaks through the cooldown when the swing escalates', async () => {
    const now = Date.now();
    addInventoryItem(context.db, { cardId: 'base1-4', variant: 'holofoil', quantity: 1 });

    await movePrice('base1-4', 1_000, 1_300, now);
    const first = generateAlerts(context.db, context.config, { now });
    assert.equal(first[0]?.magnitude, 'major');

    // The move deepens from major to extreme inside the cooldown window.
    context.provider.setPrice('base1-4', 'holofoil', 2_000);
    await refreshPrices(context.db, context.provider, context.config, {
      now: now + HOUR_MS,
      skipAlerts: true,
    });

    const second = generateAlerts(context.db, context.config, { now: now + HOUR_MS });
    assert.equal(second.length, 1);
    assert.equal(second[0]?.magnitude, 'extreme');
  });

  it('re-alerts once the cooldown has elapsed', async () => {
    const now = Date.now();
    addInventoryItem(context.db, { cardId: 'base1-4', variant: 'holofoil', quantity: 1 });
    await movePrice('base1-4', 1_000, 1_500, now);

    assert.equal(generateAlerts(context.db, context.config, { now }).length, 1);
    const later = now + (context.config.alertCooldownHours + 1) * HOUR_MS;
    // Re-establish the swing at the later timestamp.
    await refreshPrices(context.db, context.provider, context.config, {
      now: later,
      skipAlerts: true,
    });
    assert.equal(generateAlerts(context.db, context.config, { now: later }).length, 1);
  });

  it('ignores a huge percentage move on a penny card', async () => {
    const now = Date.now();
    addInventoryItem(context.db, { cardId: 'base1-58', variant: 'normal', quantity: 1 });

    context.provider.setPrice('base1-58', 'normal', 3);
    await refreshPrices(context.db, context.provider, context.config, {
      now: now - 25 * HOUR_MS,
      skipAlerts: true,
    });
    context.provider.setPrice('base1-58', 'normal', 12);
    await refreshPrices(context.db, context.provider, context.config, { now, skipAlerts: true });

    // +300%, but only nine cents.
    assert.deepEqual(generateAlerts(context.db, context.config, { now }), []);
  });
});

describe('movers', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = createTestContext();
    await syncCatalog(context.db, context.provider, { ingestPrices: false });

    const now = Date.now();
    await refreshPrices(context.db, context.provider, context.config, {
      now: now - 25 * HOUR_MS,
      skipAlerts: true,
    });
    context.provider.setPrice('base1-4', 'holofoil', 1_600);
    context.provider.setPrice('sv3pt5-6', 'holofoil', 1_500);
    await refreshPrices(context.db, context.provider, context.config, { now, skipAlerts: true });
  });

  afterEach(() => context.close());

  it('excludes cards already in the collection', () => {
    addInventoryItem(context.db, { cardId: 'base1-4', variant: 'holofoil', quantity: 1 });

    const movers = queryMovers(context.db, { windowHours: 24, excludeOwned: true });
    const ids = movers.map((mover) => mover.cardId);
    assert.ok(!ids.includes('base1-4'));
    assert.ok(ids.includes('sv3pt5-6'));
  });

  it('includes owned cards when asked', () => {
    addInventoryItem(context.db, { cardId: 'base1-4', variant: 'holofoil', quantity: 1 });

    const movers = queryMovers(context.db, { windowHours: 24, excludeOwned: false });
    assert.ok(movers.map((mover) => mover.cardId).includes('base1-4'));
  });

  it('filters by direction', () => {
    const down = queryMovers(context.db, { windowHours: 24, direction: 'down' });
    assert.equal(down.length, 0);

    const up = queryMovers(context.db, { windowHours: 24, direction: 'up' });
    assert.ok(up.length >= 2);
  });

  it('ranks the biggest percentage move first', () => {
    const movers = queryMovers(context.db, { windowHours: 24 });
    assert.equal(movers[0]?.cardId, 'base1-4');
  });
});

describe('collection valuation', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = createTestContext();
    await syncCatalog(context.db, context.provider, { ingestPrices: false });
    await refreshPrices(context.db, context.provider, context.config, { skipAlerts: true });
  });

  afterEach(() => context.close());

  it('values holdings and computes gain against acquisition cost', () => {
    addInventoryItem(context.db, {
      cardId: 'base1-4',
      variant: 'holofoil',
      quantity: 3,
      acquiredPriceCents: 600,
    });

    const { items, summary } = getCollection(context.db);
    assert.equal(summary.copies, 3);
    assert.equal(summary.totalValueCents, 3_000);
    assert.equal(summary.totalCostCents, 1_800);
    assert.equal(summary.gainCents, 1_200);
    assert.equal(items[0]?.unitValueCents, 1_000);
  });

  it('leaves gain null when the acquisition price is unknown', () => {
    addInventoryItem(context.db, { cardId: 'base1-4', variant: 'holofoil', quantity: 1 });

    const { items, summary } = getCollection(context.db);
    assert.equal(items[0]?.gainCents, null);
    assert.equal(summary.totalCostCents, 0);
  });

  it('merges a duplicate holding into a quantity instead of a second row', () => {
    addInventoryItem(context.db, { cardId: 'base1-4', variant: 'holofoil', quantity: 1 });
    addInventoryItem(context.db, { cardId: 'base1-4', variant: 'holofoil', quantity: 2 });

    const owned = listOwnedSeries(context.db);
    assert.equal(owned.length, 1);
    assert.equal(owned[0]?.quantity, 3);
  });

  it('keeps differently graded copies as separate rows', () => {
    addInventoryItem(context.db, { cardId: 'base1-4', variant: 'holofoil', quantity: 1 });
    addInventoryItem(context.db, {
      cardId: 'base1-4',
      variant: 'holofoil',
      quantity: 1,
      gradingCompany: 'PSA',
      grade: 10,
    });

    assert.equal(getCollection(context.db).items.length, 2);
  });
});
