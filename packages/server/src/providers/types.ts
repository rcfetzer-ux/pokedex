import type { Card, CardSet, PriceVariant } from '@pokedex/shared';

export interface ProviderPrice {
  variant: PriceVariant;
  marketCents: number;
  lowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  currency: string;
}

export interface ProviderCard {
  card: Omit<Card, 'variants'>;
  prices: ProviderPrice[];
}

/**
 * One provider supplies both the catalog and the prices, because every feed
 * worth using returns them on the same record — splitting them would double
 * the request count against a rate-limited API for no benefit.
 */
export interface CardDataProvider {
  readonly name: string;
  listSets(): Promise<CardSet[]>;
  listCards(setId: string): Promise<ProviderCard[]>;
  /**
   * Optional: price at an arbitrary past timestamp. Only the offline fixture
   * provider can answer this; real feeds do not sell history, which is exactly
   * why we snapshot into `price_snapshots` ourselves.
   */
  priceAt?(cardId: string, variant: PriceVariant, ts: number): ProviderPrice | null;
}
