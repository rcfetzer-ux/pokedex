import { dollarsToCents, isPriceVariant, type CardSet, type PriceVariant } from '@pokedex/shared';

import type { CardDataProvider, ProviderCard, ProviderPrice } from './types.js';

const BASE_URL = 'https://api.pokemontcg.io/v2';
const PAGE_SIZE = 250;

interface ApiSet {
  id: string;
  name: string;
  series?: string;
  printedTotal?: number;
  total?: number;
  releaseDate?: string;
  ptcgoCode?: string;
  images?: { symbol?: string; logo?: string };
}

interface ApiTcgPlayerPrice {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
  directLow?: number | null;
}

interface ApiCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  supertype?: string;
  subtypes?: string[];
  artist?: string;
  set: { id: string };
  images?: { small?: string; large?: string };
  tcgplayer?: {
    prices?: Record<string, ApiTcgPlayerPrice | undefined>;
  };
}

interface ApiListResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

export interface PokemonTcgIoOptions {
  apiKey?: string | null;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /** Retries per request on 429/5xx. */
  maxRetries?: number;
  baseUrl?: string;
}

/**
 * pokemontcg.io — free, covers every English set, and embeds TCGplayer market
 * prices on each card. Prices refresh roughly daily upstream.
 */
export class PokemonTcgIoProvider implements CardDataProvider {
  readonly name = 'pokemontcgio';

  private readonly apiKey: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseUrl: string;

  constructor(options: PokemonTcgIoOptions = {}) {
    this.apiKey = options.apiKey ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseUrl = options.baseUrl ?? BASE_URL;
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, { headers });
        if (response.ok) return (await response.json()) as T;

        // Rate limits and transient upstream errors are worth retrying; a 404
        // or a bad API key is not, and retrying one would repeat the same
        // pointless round trip for every set in the catalog.
        if (response.status !== 429 && response.status < 500) {
          throw new NonRetryableProviderError(
            `${this.name} ${response.status} for ${url.pathname}`,
          );
        }
        lastError = new Error(`${this.name} ${response.status}`);
      } catch (error) {
        if (error instanceof NonRetryableProviderError) throw error;
        lastError = error;
      }

      if (attempt < this.maxRetries) {
        await sleep(2 ** attempt * 1000);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`${this.name} request failed`);
  }

  async listSets(): Promise<CardSet[]> {
    const sets: CardSet[] = [];
    for (let page = 1; ; page += 1) {
      const body = await this.request<ApiListResponse<ApiSet>>('/sets', {
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      for (const set of body.data) sets.push(mapSet(set));
      if (body.data.length < PAGE_SIZE || sets.length >= body.totalCount) break;
    }
    return sets;
  }

  async listCards(setId: string): Promise<ProviderCard[]> {
    const cards: ProviderCard[] = [];
    for (let page = 1; ; page += 1) {
      const body = await this.request<ApiListResponse<ApiCard>>('/cards', {
        q: `set.id:"${setId}"`,
        page: String(page),
        pageSize: String(PAGE_SIZE),
        orderBy: 'number',
      });
      for (const card of body.data) cards.push(mapCard(card));
      if (body.data.length < PAGE_SIZE || cards.length >= body.totalCount) break;
    }
    return cards;
  }
}

/** A response that will fail identically no matter how often it is retried. */
export class NonRetryableProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableProviderError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapSet(set: ApiSet): CardSet {
  return {
    id: set.id,
    name: set.name,
    series: set.series ?? '',
    printedTotal: set.printedTotal ?? null,
    total: set.total ?? null,
    releaseDate: set.releaseDate ?? null,
    symbolImage: set.images?.symbol ?? null,
    logoImage: set.images?.logo ?? null,
    ptcgoCode: set.ptcgoCode ?? null,
  };
}

export function mapPrices(card: ApiCard): ProviderPrice[] {
  const prices = card.tcgplayer?.prices;
  if (!prices) return [];

  const out: ProviderPrice[] = [];
  for (const [rawVariant, value] of Object.entries(prices)) {
    if (!value || !isPriceVariant(rawVariant)) continue;

    // `market` is the number that reflects what cards actually sell for.
    // Some listings only report a mid, so fall back rather than drop the row.
    const marketCents = dollarsToCents(value.market ?? value.mid ?? null);
    if (marketCents == null || marketCents <= 0) continue;

    out.push({
      variant: rawVariant as PriceVariant,
      marketCents,
      lowCents: dollarsToCents(value.low ?? null),
      midCents: dollarsToCents(value.mid ?? null),
      highCents: dollarsToCents(value.high ?? null),
      currency: 'USD',
    });
  }
  return out;
}

function mapCard(card: ApiCard): ProviderCard {
  return {
    card: {
      id: card.id,
      name: card.name,
      setId: card.set.id,
      number: card.number,
      rarity: card.rarity ?? null,
      supertype: card.supertype ?? null,
      subtypes: card.subtypes ?? [],
      artist: card.artist ?? null,
      imageSmall: card.images?.small ?? null,
      imageLarge: card.images?.large ?? null,
    },
    prices: mapPrices(card),
  };
}
