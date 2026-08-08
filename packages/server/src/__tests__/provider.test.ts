import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FixtureProvider } from '../providers/fixture.js';
import { PokemonTcgIoProvider } from '../providers/pokemontcgio.js';

const HOUR_MS = 60 * 60 * 1000;

/** Minimal stand-in for the pokemontcg.io JSON shape. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function cardPayload(prices: Record<string, unknown>) {
  return {
    data: [
      {
        id: 'sv3pt5-6',
        name: 'Charizard ex',
        number: '6',
        rarity: 'Double Rare',
        supertype: 'Pokémon',
        set: { id: 'sv3pt5' },
        images: { small: 'small.png', large: 'large.png' },
        tcgplayer: { prices },
      },
    ],
    page: 1,
    pageSize: 250,
    count: 1,
    totalCount: 1,
  };
}

describe('PokemonTcgIoProvider', () => {
  it('maps market prices to integer cents per variant', async () => {
    const provider = new PokemonTcgIoProvider({
      fetchImpl: async () =>
        jsonResponse(
          cardPayload({
            holofoil: { low: 20.5, mid: 27.11, high: 45, market: 28.42 },
            reverseHolofoil: { low: 8, mid: 10, high: 15, market: 9.99 },
          }),
        ),
    });

    const cards = await provider.listCards('sv3pt5');
    const prices = cards[0]!.prices;

    assert.equal(prices.length, 2);
    const holo = prices.find((price) => price.variant === 'holofoil');
    assert.equal(holo?.marketCents, 2_842);
    assert.equal(holo?.lowCents, 2_050);
    assert.equal(holo?.highCents, 4_500);
    assert.equal(prices.find((p) => p.variant === 'reverseHolofoil')?.marketCents, 999);
  });

  it('falls back to mid when the feed has no market price', async () => {
    const provider = new PokemonTcgIoProvider({
      fetchImpl: async () =>
        jsonResponse(cardPayload({ holofoil: { low: 1, mid: 2.5, high: 4, market: null } })),
    });

    const prices = (await provider.listCards('sv3pt5'))[0]!.prices;
    assert.equal(prices[0]?.marketCents, 250);
  });

  it('drops variants with no usable price rather than recording zero', async () => {
    const provider = new PokemonTcgIoProvider({
      fetchImpl: async () =>
        jsonResponse(
          cardPayload({
            holofoil: { low: null, mid: null, high: null, market: null },
            normal: { market: 1.25 },
          }),
        ),
    });

    const prices = (await provider.listCards('sv3pt5'))[0]!.prices;
    assert.deepEqual(
      prices.map((price) => price.variant),
      ['normal'],
    );
  });

  it('ignores variant keys it does not understand', async () => {
    const provider = new PokemonTcgIoProvider({
      fetchImpl: async () =>
        jsonResponse(cardPayload({ someFutureFoil: { market: 9 }, normal: { market: 1 } })),
    });

    const prices = (await provider.listCards('sv3pt5'))[0]!.prices;
    assert.deepEqual(
      prices.map((price) => price.variant),
      ['normal'],
    );
  });

  it('retries a rate-limited request', async () => {
    let calls = 0;
    const provider = new PokemonTcgIoProvider({
      maxRetries: 2,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return new Response('slow down', { status: 429 });
        return jsonResponse(cardPayload({ normal: { market: 1 } }));
      },
    });

    const cards = await provider.listCards('sv3pt5');
    assert.equal(calls, 2);
    assert.equal(cards.length, 1);
  });

  it('does not retry a client error', async () => {
    let calls = 0;
    const provider = new PokemonTcgIoProvider({
      maxRetries: 3,
      fetchImpl: async () => {
        calls += 1;
        return new Response('bad key', { status: 401 });
      },
    });

    await assert.rejects(() => provider.listCards('sv3pt5'), /401/);
    assert.equal(calls, 1);
  });

  it('sends the API key when configured', async () => {
    let seenKey: string | null = null;
    const provider = new PokemonTcgIoProvider({
      apiKey: 'secret-key',
      fetchImpl: async (_url, init) => {
        seenKey = (init?.headers as Record<string, string>)['X-Api-Key'] ?? null;
        return jsonResponse({ data: [], page: 1, pageSize: 250, count: 0, totalCount: 0 });
      },
    });

    await provider.listSets();
    assert.equal(seenKey, 'secret-key');
  });
});

describe('FixtureProvider', () => {
  const provider = new FixtureProvider();

  it('is deterministic for a given card, variant and timestamp', () => {
    const ts = 1_700_000_000_000;
    const first = provider.priceAt('base1-4', 'holofoil', ts);
    const second = new FixtureProvider().priceAt('base1-4', 'holofoil', ts);
    assert.equal(first?.marketCents, second?.marketCents);
  });

  it('produces a different price at a different time', () => {
    const ts = 1_700_000_000_000;
    const now = provider.priceAt('base1-4', 'holofoil', ts)?.marketCents;
    const weekAgo = provider.priceAt('base1-4', 'holofoil', ts - 7 * 24 * HOUR_MS)?.marketCents;
    assert.notEqual(now, weekAgo);
  });

  it('returns null for a variant the card is not printed in', () => {
    assert.equal(provider.priceAt('base1-4', 'reverseHolofoil', Date.now()), null);
  });

  it('returns null for an unknown card', () => {
    assert.equal(provider.priceAt('nope-1', 'holofoil', Date.now()), null);
  });

  it('keeps prices positive and bounded', () => {
    const ts = 1_700_000_000_000;
    for (let day = 0; day < 120; day += 1) {
      const price = provider.priceAt('base1-4', 'holofoil', ts + day * 24 * HOUR_MS);
      assert.ok(price);
      assert.ok(price.marketCents > 0, `price went non-positive on day ${day}`);
      assert.ok(price.marketCents < 42_000 * 21, `price exploded on day ${day}`);
    }
  });

  it('orders the price spread low <= market <= high', () => {
    const price = provider.priceAt('sv3pt5-199', 'holofoil', Date.now());
    assert.ok(price);
    assert.ok(price.lowCents! <= price.marketCents);
    assert.ok(price.highCents! >= price.marketCents);
  });

  it('covers every fixture set', async () => {
    const sets = await provider.listSets();
    for (const set of sets) {
      const cards = await provider.listCards(set.id);
      assert.ok(cards.length > 0, `${set.id} produced no cards`);
    }
  });
});
