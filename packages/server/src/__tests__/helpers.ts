import { DEFAULT_THRESHOLDS, type CardSet, type PriceVariant } from '@pokedex/shared';

import type { Config } from '../config.js';
import type { AppContext } from '../context.js';
import { openDatabase, type Db } from '../db/index.js';
import type { CardDataProvider, ProviderCard, ProviderPrice } from '../providers/types.js';
import { StaticOcrEngine } from '../services/ocr.js';

export const TEST_SET: CardSet = {
  id: 'base1',
  name: 'Base',
  series: 'Base',
  printedTotal: 102,
  total: 102,
  releaseDate: '1999/01/09',
  symbolImage: null,
  logoImage: null,
  ptcgoCode: 'BS',
};

export const TEST_SET_TWO: CardSet = {
  id: 'sv3pt5',
  name: '151',
  series: 'Scarlet & Violet',
  printedTotal: 165,
  total: 207,
  releaseDate: '2023/09/22',
  symbolImage: null,
  logoImage: null,
  ptcgoCode: 'MEW',
};

interface TestCardDef {
  id: string;
  name: string;
  setId: string;
  number: string;
  variants: PriceVariant[];
}

export const TEST_CARDS: TestCardDef[] = [
  { id: 'base1-4', name: 'Charizard', setId: 'base1', number: '4', variants: ['holofoil'] },
  { id: 'base1-2', name: 'Blastoise', setId: 'base1', number: '2', variants: ['holofoil'] },
  { id: 'base1-58', name: 'Pikachu', setId: 'base1', number: '58', variants: ['normal'] },
  { id: 'sv3pt5-6', name: 'Charizard ex', setId: 'sv3pt5', number: '6', variants: ['holofoil'] },
  { id: 'sv3pt5-151', name: 'Mew ex', setId: 'sv3pt5', number: '151', variants: ['holofoil'] },
  // Same name as base1-4, different set. Reprints like this are the reason the
  // scanner needs a collector number before it will commit to a match.
  { id: 'sv3pt5-11', name: 'Charizard', setId: 'sv3pt5', number: '11', variants: ['holofoil'] },
];

/**
 * Provider whose prices the test sets directly, so assertions can be about
 * exact numbers instead of about a random walk.
 */
export class ControlledProvider implements CardDataProvider {
  readonly name = 'controlled';
  private readonly prices = new Map<string, number>();

  constructor(defaultPriceCents = 1_000) {
    for (const card of TEST_CARDS) {
      for (const variant of card.variants) {
        this.prices.set(`${card.id}|${variant}`, defaultPriceCents);
      }
    }
  }

  setPrice(cardId: string, variant: PriceVariant, marketCents: number): void {
    this.prices.set(`${cardId}|${variant}`, marketCents);
  }

  async listSets(): Promise<CardSet[]> {
    return [TEST_SET, TEST_SET_TWO];
  }

  async listCards(setId: string): Promise<ProviderCard[]> {
    return TEST_CARDS.filter((card) => card.setId === setId).map((card) => ({
      card: {
        id: card.id,
        name: card.name,
        setId: card.setId,
        number: card.number,
        rarity: 'Rare Holo',
        supertype: 'Pokémon',
        subtypes: [],
        artist: null,
        imageSmall: null,
        imageLarge: null,
      },
      prices: card.variants.map((variant): ProviderPrice => {
        const marketCents = this.prices.get(`${card.id}|${variant}`) ?? 1_000;
        return {
          variant,
          marketCents,
          lowCents: Math.round(marketCents * 0.9),
          midCents: marketCents,
          highCents: Math.round(marketCents * 1.2),
          currency: 'USD',
        };
      }),
    }));
  }
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    databasePath: ':memory:',
    provider: 'fixture',
    pokemonTcgApiKey: null,
    priceRefreshMinutes: 60,
    disableScheduler: true,
    thresholds: DEFAULT_THRESHOLDS,
    notifyAtOrAbove: 'major',
    notifyOnMarketMovers: false,
    marketAlertMinMagnitude: 'extreme',
    marketAlertLimit: 10,
    alertCooldownHours: 12,
    historyRetentionDays: 400,
    swingWindowsHours: [24, 168],
    moversMinPriceCents: 200,
    priceRefreshLimit: 0,
    apiToken: null,
    webRoot: null,
    ...overrides,
  };
}

export interface TestContext extends AppContext {
  provider: ControlledProvider;
  db: Db;
  close(): void;
}

export function createTestContext(overrides: Partial<Config> = {}): TestContext {
  const db = openDatabase(':memory:');
  return {
    db,
    config: testConfig(overrides),
    provider: new ControlledProvider(),
    ocr: new StaticOcrEngine(''),
    close: () => db.close(),
  };
}

export const HOUR_MS = 60 * 60 * 1000;
