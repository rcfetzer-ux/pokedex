import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { addInventoryItem } from '../repos/inventory.js';
import { syncCatalog } from '../services/catalog.js';
import { refreshPrices } from '../services/prices.js';
import { HOUR_MS, createTestContext, type TestContext } from './helpers.js';

describe('http api', () => {
  let context: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    context = createTestContext();
    await syncCatalog(context.db, context.provider, { ingestPrices: false });

    const now = Date.now();
    await refreshPrices(context.db, context.provider, context.config, {
      now: now - 25 * HOUR_MS,
      skipAlerts: true,
    });
    context.provider.setPrice('sv3pt5-6', 'holofoil', 1_800);
    await refreshPrices(context.db, context.provider, context.config, { now, skipAlerts: true });

    app = await buildApp(context);
  });

  afterEach(async () => {
    await app.close();
    context.close();
  });

  it('reports status', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/status' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().cards, 6);
  });

  it('searches cards by name', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/cards?q=charizard' });
    assert.equal(response.statusCode, 200);
    const names = response.json().cards.map((card: { name: string }) => card.name);
    assert.ok(names.includes('Charizard'));
    assert.ok(names.includes('Charizard ex'));
  });

  it('returns 404 for an unknown card', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/cards/nope-999' });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error, 'card_not_found');
  });

  it('returns price history for a card', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/cards/base1-4/history?days=7' });
    assert.equal(response.statusCode, 200);
    const series = response.json().series;
    assert.equal(series.length, 1);
    assert.equal(series[0].variant, 'holofoil');
    assert.ok(series[0].points.length >= 2);
  });

  it('identifies a card from scanned text', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scan',
      payload: { text: 'Charizard\nStage 2\n4/102\nIllus. Mitsuhiro Arita' },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.candidates[0].card.id, 'base1-4');
    assert.equal(body.autoAcceptable, true);
    assert.equal(body.parsed.number, '4');
  });

  it('refuses to auto-accept when two sets share the card name', async () => {
    // "Charizard" exists in both Base and 151; with no collector number to
    // separate them, committing to either would be a coin flip.
    const response = await app.inject({
      method: 'POST',
      url: '/api/scan',
      payload: { text: 'Charizard' },
    });

    const body = response.json();
    assert.equal(body.autoAcceptable, false);
    assert.deepEqual(
      body.candidates.slice(0, 2).map((c: { card: { id: string } }) => c.card.id).sort(),
      ['base1-4', 'sv3pt5-11'],
    );
  });

  it('rejects a scan with neither text nor image', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/scan', payload: {} });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'missing_text_or_image');
  });

  it('adds a scanned card to the collection', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/inventory',
      payload: { cardId: 'base1-4', variant: 'holofoil', quantity: 2, acquiredPriceCents: 500 },
    });
    assert.equal(created.statusCode, 201);

    const collection = await app.inject({ method: 'GET', url: '/api/collection' });
    const body = collection.json();
    assert.equal(body.summary.copies, 2);
    assert.equal(body.summary.totalValueCents, 2_000);
    assert.equal(body.summary.gainCents, 1_000);
  });

  it('rejects adding a card that is not in the catalog', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/inventory',
      payload: { cardId: 'ghost-1', variant: 'holofoil' },
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error, 'card_not_found');
  });

  it('validates the request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/inventory',
      payload: { cardId: 'base1-4', variant: 'not-a-variant' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'invalid_request');
  });

  it('updates and deletes an inventory item', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/inventory',
      payload: { cardId: 'base1-4', variant: 'holofoil', quantity: 1 },
    });
    const id = created.json().item.id;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/inventory/${id}`,
      payload: { quantity: 5, condition: 'LP' },
    });
    assert.equal(patched.json().item.quantity, 5);
    assert.equal(patched.json().item.condition, 'LP');

    const deleted = await app.inject({ method: 'DELETE', url: `/api/inventory/${id}` });
    assert.equal(deleted.statusCode, 204);

    const missing = await app.inject({ method: 'DELETE', url: `/api/inventory/${id}` });
    assert.equal(missing.statusCode, 404);
  });

  it('lists 24h movers outside the collection', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/movers?windowHours=24' });
    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.windowHours, 24);
    assert.ok(body.movers.some((mover: { card: { id: string } }) => mover.card.id === 'sv3pt5-6'));
  });

  it('drops a card from the movers feed once it is owned', async () => {
    addInventoryItem(context.db, { cardId: 'sv3pt5-6', variant: 'holofoil', quantity: 1 });

    const response = await app.inject({ method: 'GET', url: '/api/movers?windowHours=24' });
    const ids = response.json().movers.map((mover: { card: { id: string } }) => mover.card.id);
    assert.ok(!ids.includes('sv3pt5-6'));
  });

  it('lists alerts and marks them read', async () => {
    addInventoryItem(context.db, { cardId: 'sv3pt5-6', variant: 'holofoil', quantity: 1 });
    await app.inject({ method: 'POST', url: '/api/admin/refresh-prices' });

    const listed = await app.inject({ method: 'GET', url: '/api/alerts' });
    const body = listed.json();
    assert.ok(body.alerts.length >= 1);
    assert.equal(body.unread, body.alerts.length);
    // Alerts carry the card so the feed renders without a second round trip.
    assert.equal(body.alerts[0].card.id, 'sv3pt5-6');

    const read = await app.inject({ method: 'POST', url: `/api/alerts/${body.alerts[0].id}/read` });
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().unread, body.unread - 1);
  });

  it('registers a push token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/push/register',
      payload: { token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', platform: 'ios' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().ok, true);
  });
});
