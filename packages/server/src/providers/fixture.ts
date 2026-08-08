import type { CardSet, PriceVariant } from '@pokedex/shared';

import {
  DEFAULT_RARITY_BAND,
  FILLER_NAMES,
  FILLER_PER_SET,
  FILLER_RARITIES,
  FIXTURE_HEADLINERS,
  FIXTURE_SETS,
  RARITY_BASE_CENTS,
  type FixtureCardDef,
} from './fixture-data.js';
import type { CardDataProvider, ProviderCard, ProviderPrice } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** How far back shocks are accumulated. Bounds the cost of a price lookup. */
const SHOCK_MEMORY_DAYS = 60;
/** Card-days that get a shock, per thousand. */
const SHOCK_RATE_PER_1000 = 100;

const VARIANT_MULTIPLIER: Record<PriceVariant, number> = {
  normal: 1,
  holofoil: 1,
  reverseHolofoil: 0.35,
  '1stEditionNormal': 2.5,
  '1stEditionHolofoil': 3.2,
};

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic 0..1 from an arbitrary key. */
function rand01(key: string): number {
  let x = fnv1a(key);
  x ^= x << 13;
  x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;
  x >>>= 0;
  return x / 0xffffffff;
}

function randRange(key: string, min: number, max: number): number {
  return min + rand01(key) * (max - min);
}

interface FixtureCard extends FixtureCardDef {
  id: string;
  setId: string;
}

/**
 * Offline provider. Generates a stable catalog and a deterministic price
 * history: `priceAt` is a pure function of (card, variant, timestamp), so the
 * seed script can backfill weeks of hourly snapshots instantly and every run
 * produces the same numbers.
 */
export class FixtureProvider implements CardDataProvider {
  readonly name = 'fixture';

  private readonly cardsBySet = new Map<string, FixtureCard[]>();
  private readonly cardsById = new Map<string, FixtureCard>();

  constructor() {
    for (const set of FIXTURE_SETS) {
      const cards = buildSetCards(set);
      this.cardsBySet.set(set.id, cards);
      for (const card of cards) this.cardsById.set(card.id, card);
    }
  }

  async listSets(): Promise<CardSet[]> {
    return FIXTURE_SETS.map((set) => ({ ...set }));
  }

  async listCards(setId: string): Promise<ProviderCard[]> {
    const cards = this.cardsBySet.get(setId) ?? [];
    const now = Date.now();
    return cards.map((card) => ({
      card: {
        id: card.id,
        name: card.name,
        setId: card.setId,
        number: card.number,
        rarity: card.rarity,
        supertype: 'Pokémon',
        subtypes: [],
        artist: null,
        imageSmall: null,
        imageLarge: null,
      },
      prices: card.variants
        .map((variant) => this.priceAt(card.id, variant, now))
        .filter((price): price is ProviderPrice => price !== null),
    }));
  }

  priceAt(cardId: string, variant: PriceVariant, ts: number): ProviderPrice | null {
    const card = this.cardsById.get(cardId);
    if (!card || !card.variants.includes(variant)) return null;

    const base = basePriceCents(card) * (VARIANT_MULTIPLIER[variant] ?? 1);
    const key = `${cardId}|${variant}`;

    // Two slow sinusoids give a believable baseline wander; the phases are
    // per-card so the whole market does not move in lockstep.
    const phaseA = rand01(`${key}|phaseA`) * Math.PI * 2;
    const phaseB = rand01(`${key}|phaseB`) * Math.PI * 2;
    const drift =
      0.06 * Math.sin((ts / (30 * DAY_MS)) * Math.PI * 2 + phaseA) +
      0.03 * Math.sin((ts / (7 * DAY_MS)) * Math.PI * 2 + phaseB);

    let multiplier = Math.exp(drift);

    // Shocks are step changes that persist, the way a real price reacts to a
    // tournament result or a reprint announcement — accumulated over a bounded
    // window so this stays O(1)-ish.
    const today = Math.floor(ts / DAY_MS);
    for (let day = today - SHOCK_MEMORY_DAYS; day <= today; day += 1) {
      const magnitude = shockMagnitude(key, day);
      if (magnitude === 0) continue;
      const progress = day === today ? (ts % DAY_MS) / DAY_MS : 1;
      multiplier *= 1 + magnitude * progress;
    }

    const marketCents = Math.max(
      Math.max(5, Math.round(base * 0.05)),
      Math.min(Math.round(base * 20), Math.round(base * multiplier)),
    );

    const spread = randRange(`${key}|spread`, 0.08, 0.35);
    return {
      variant,
      marketCents,
      lowCents: Math.max(1, Math.round(marketCents * (1 - spread))),
      midCents: Math.round(marketCents * (1 - spread / 3)),
      highCents: Math.round(marketCents * (1 + spread * 2)),
      currency: 'USD',
    };
  }
}

/** 0 when the card-day has no shock, else the fractional size of the move. */
function shockMagnitude(key: string, day: number): number {
  const roll = Math.floor(rand01(`${key}|shock|${day}`) * 1000);
  if (roll >= SHOCK_RATE_PER_1000) return 0;
  // Skewed slightly upward: hype spikes are sharper than slow bleeds.
  return randRange(`${key}|shockmag|${day}`, -0.45, 0.75);
}

function basePriceCents(card: FixtureCard): number {
  if (card.basePriceCents != null) return card.basePriceCents;
  const band = RARITY_BASE_CENTS[card.rarity] ?? DEFAULT_RARITY_BAND;
  return Math.round(randRange(`${card.id}|base`, band[0], band[1]));
}

function pickFillerRarity(key: string): { rarity: string; variants: PriceVariant[] } {
  const totalWeight = FILLER_RARITIES.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rand01(key) * totalWeight;
  for (const entry of FILLER_RARITIES) {
    roll -= entry.weight;
    if (roll <= 0) return { rarity: entry.rarity, variants: entry.variants };
  }
  const last = FILLER_RARITIES[FILLER_RARITIES.length - 1]!;
  return { rarity: last.rarity, variants: last.variants };
}

function buildSetCards(set: CardSet): FixtureCard[] {
  const headliners = FIXTURE_HEADLINERS[set.id] ?? [];
  const used = new Set(headliners.map((card) => card.number));

  const cards: FixtureCard[] = headliners.map((card) => ({
    ...card,
    id: `${set.id}-${card.number}`,
    setId: set.id,
  }));

  const capacity = set.printedTotal ?? 100;
  let number = 1;
  for (let i = 0; i < FILLER_PER_SET && number <= capacity; i += 1) {
    while (used.has(String(number)) && number <= capacity) number += 1;
    if (number > capacity) break;

    const id = `${set.id}-${number}`;
    const name = FILLER_NAMES[fnv1a(id) % FILLER_NAMES.length]!;
    const { rarity, variants } = pickFillerRarity(`${id}|rarity`);

    cards.push({ id, setId: set.id, name, number: String(number), rarity, variants });
    used.add(String(number));
    number += 1;
  }

  return cards;
}
