/**
 * Core domain types. Money is always integer cents to keep arithmetic exact —
 * no float drift when we diff two snapshots taken a day apart.
 */

/** Printing variants. These key off TCGplayer's variant names, which are the
 *  finest granularity most price feeds expose. A card's value can differ by an
 *  order of magnitude between `normal` and `1stEditionHolofoil`. */
export const PRICE_VARIANTS = [
  'normal',
  'holofoil',
  'reverseHolofoil',
  '1stEditionNormal',
  '1stEditionHolofoil',
] as const;
export type PriceVariant = (typeof PRICE_VARIANTS)[number];

export function isPriceVariant(value: string): value is PriceVariant {
  return (PRICE_VARIANTS as readonly string[]).includes(value);
}

/** Raw (ungraded) condition grades, standard TCG shorthand. */
export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const GRADING_COMPANIES = ['PSA', 'BGS', 'CGC', 'SGC'] as const;
export type GradingCompany = (typeof GRADING_COMPANIES)[number];

export interface CardSet {
  id: string;
  name: string;
  series: string;
  /** Number printed on the card ("165" in 4/165). Null for sets that omit it. */
  printedTotal: number | null;
  /** Actual count including secret rares. */
  total: number | null;
  releaseDate: string | null;
  symbolImage: string | null;
  logoImage: string | null;
  /** Set code stamped on modern cards ("SVI", "PAL"). Null for older sets. */
  ptcgoCode: string | null;
}

export interface Card {
  id: string;
  name: string;
  setId: string;
  /** Collector number as printed, e.g. "4", "TG12", "SWSH284". */
  number: string;
  rarity: string | null;
  supertype: string | null;
  subtypes: string[];
  artist: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  /** Variants this card is actually printed in, per the price feed. */
  variants: PriceVariant[];
}

/** A card joined with its set — what the UI almost always wants. */
export interface CardWithSet extends Card {
  set: CardSet;
}

export interface PricePoint {
  cardId: string;
  variant: PriceVariant;
  /** Epoch milliseconds. */
  ts: number;
  marketCents: number;
  lowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  currency: string;
  source: string;
}

export interface InventoryItem {
  id: string;
  cardId: string;
  variant: PriceVariant;
  condition: Condition;
  gradingCompany: GradingCompany | null;
  /** e.g. 10, 9.5. Null when raw/ungraded. */
  grade: number | null;
  quantity: number;
  /** What the user paid, per copy. Null when unknown. */
  acquiredPriceCents: number | null;
  acquiredAt: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface InventoryItemWithValue extends InventoryItem {
  card: CardWithSet;
  /** Latest market price for this card+variant, per copy. */
  unitValueCents: number | null;
  /** unitValueCents * quantity. */
  totalValueCents: number | null;
  /** totalValue - (acquired * quantity). Null when acquisition cost unknown. */
  gainCents: number | null;
  change24h: PriceChange | null;
}

export type SwingDirection = 'up' | 'down' | 'flat';

/** How big a move is, once both percent and dollar size are considered. */
export type SwingMagnitude = 'none' | 'minor' | 'notable' | 'major' | 'extreme';

export interface PriceChange {
  fromCents: number;
  toCents: number;
  changeCents: number;
  /** Fractional, not percentage points: 0.25 === +25%. */
  changeRatio: number;
  direction: SwingDirection;
  magnitude: SwingMagnitude;
  windowHours: number;
  /** Timestamps of the two points actually compared. */
  fromTs: number;
  toTs: number;
}

export interface Swing extends PriceChange {
  cardId: string;
  variant: PriceVariant;
}

export type AlertKind = 'inventory_swing' | 'market_swing';

export interface Alert {
  id: string;
  kind: AlertKind;
  cardId: string;
  variant: PriceVariant;
  windowHours: number;
  fromCents: number;
  toCents: number;
  changeCents: number;
  changeRatio: number;
  direction: SwingDirection;
  magnitude: SwingMagnitude;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
  pushedAt: number | null;
}

export interface AlertWithCard extends Alert {
  card: CardWithSet | null;
}

/** A candidate produced by matching scanned text against the catalog. */
export interface ScanCandidate {
  card: CardWithSet;
  /** 0..1. */
  score: number;
  reasons: string[];
  latestPriceCents: number | null;
}

export interface ParsedCardText {
  /** Best guess at the card name. */
  name: string | null;
  /** Collector number as printed, e.g. "4", "TG12". */
  number: string | null;
  /** Denominator of "4/165", when present. */
  printedTotal: number | null;
  /** Set code stamped on modern cards, e.g. "SVI", "PAL". */
  setCode: string | null;
  /** Detected "1st Edition" stamp. */
  firstEdition: boolean;
  /** Every non-empty line, normalized — used for fallback scoring. */
  lines: string[];
}
