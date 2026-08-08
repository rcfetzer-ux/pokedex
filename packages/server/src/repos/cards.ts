import {
  isPriceVariant,
  normalizeName,
  normalizeNumber,
  type Card,
  type CardSet,
  type CardWithSet,
  type ParsedCardText,
  type PriceVariant,
} from '@pokedex/shared';

import type { Db } from '../db/index.js';

interface SetRow {
  id: string;
  name: string;
  series: string;
  printed_total: number | null;
  total: number | null;
  release_date: string | null;
  symbol_image: string | null;
  logo_image: string | null;
  ptcgo_code: string | null;
}

interface CardRow {
  id: string;
  set_id: string;
  name: string;
  number: string;
  rarity: string | null;
  supertype: string | null;
  subtypes: string;
  artist: string | null;
  image_small: string | null;
  image_large: string | null;
  variants: string;
}

type CardWithSetRow = CardRow & {
  set_name: string;
  set_series: string;
  set_printed_total: number | null;
  set_total: number | null;
  set_release_date: string | null;
  set_symbol_image: string | null;
  set_logo_image: string | null;
  set_ptcgo_code: string | null;
};

const CARD_WITH_SET_SELECT = `
  SELECT c.*,
         s.name          AS set_name,
         s.series        AS set_series,
         s.printed_total AS set_printed_total,
         s.total         AS set_total,
         s.release_date  AS set_release_date,
         s.symbol_image  AS set_symbol_image,
         s.logo_image    AS set_logo_image,
         s.ptcgo_code    AS set_ptcgo_code
  FROM cards c
  JOIN sets s ON s.id = c.set_id
`;

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function mapSetRow(row: SetRow): CardSet {
  return {
    id: row.id,
    name: row.name,
    series: row.series,
    printedTotal: row.printed_total,
    total: row.total,
    releaseDate: row.release_date,
    symbolImage: row.symbol_image,
    logoImage: row.logo_image,
    ptcgoCode: row.ptcgo_code,
  };
}

export function mapCardRow(row: CardRow): Card {
  return {
    id: row.id,
    name: row.name,
    setId: row.set_id,
    number: row.number,
    rarity: row.rarity,
    supertype: row.supertype,
    subtypes: parseJsonArray(row.subtypes),
    artist: row.artist,
    imageSmall: row.image_small,
    imageLarge: row.image_large,
    variants: parseJsonArray(row.variants).filter(isPriceVariant),
  };
}

export function mapCardWithSetRow(row: CardWithSetRow): CardWithSet {
  return {
    ...mapCardRow(row),
    set: {
      id: row.set_id,
      name: row.set_name,
      series: row.set_series,
      printedTotal: row.set_printed_total,
      total: row.set_total,
      releaseDate: row.set_release_date,
      symbolImage: row.set_symbol_image,
      logoImage: row.set_logo_image,
      ptcgoCode: row.set_ptcgo_code,
    },
  };
}

export function upsertSets(db: Db, sets: readonly CardSet[]): number {
  const statement = db.prepare(`
    INSERT INTO sets (id, name, series, printed_total, total, release_date,
                      symbol_image, logo_image, ptcgo_code, updated_at)
    VALUES (@id, @name, @series, @printedTotal, @total, @releaseDate,
            @symbolImage, @logoImage, @ptcgoCode, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      series = excluded.series,
      printed_total = excluded.printed_total,
      total = excluded.total,
      release_date = excluded.release_date,
      symbol_image = excluded.symbol_image,
      logo_image = excluded.logo_image,
      ptcgo_code = excluded.ptcgo_code,
      updated_at = excluded.updated_at
  `);

  const now = Date.now();
  const run = db.transaction((rows: readonly CardSet[]) => {
    for (const set of rows) statement.run({ ...set, updatedAt: now });
  });
  run(sets);
  return sets.length;
}

export interface CardUpsert extends Omit<Card, 'variants'> {
  variants: PriceVariant[];
}

export function upsertCards(db: Db, cards: readonly CardUpsert[]): number {
  const statement = db.prepare(`
    INSERT INTO cards (id, set_id, name, number, rarity, supertype, subtypes, artist,
                       image_small, image_large, variants, name_normalized,
                       number_normalized, updated_at)
    VALUES (@id, @setId, @name, @number, @rarity, @supertype, @subtypes, @artist,
            @imageSmall, @imageLarge, @variants, @nameNormalized,
            @numberNormalized, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      set_id = excluded.set_id,
      name = excluded.name,
      number = excluded.number,
      rarity = excluded.rarity,
      supertype = excluded.supertype,
      subtypes = excluded.subtypes,
      artist = excluded.artist,
      image_small = excluded.image_small,
      image_large = excluded.image_large,
      variants = excluded.variants,
      name_normalized = excluded.name_normalized,
      number_normalized = excluded.number_normalized,
      updated_at = excluded.updated_at
  `);

  const now = Date.now();
  const run = db.transaction((rows: readonly CardUpsert[]) => {
    for (const card of rows) {
      statement.run({
        id: card.id,
        setId: card.setId,
        name: card.name,
        number: card.number,
        rarity: card.rarity,
        supertype: card.supertype,
        subtypes: JSON.stringify(card.subtypes ?? []),
        artist: card.artist,
        imageSmall: card.imageSmall,
        imageLarge: card.imageLarge,
        variants: JSON.stringify(card.variants ?? []),
        nameNormalized: normalizeName(card.name),
        numberNormalized: normalizeNumber(card.number),
        updatedAt: now,
      });
    }
  });
  run(cards);
  return cards.length;
}

export function listSets(db: Db): CardSet[] {
  return (db.prepare('SELECT * FROM sets ORDER BY release_date DESC, name').all() as SetRow[]).map(
    mapSetRow,
  );
}

export function getCard(db: Db, cardId: string): CardWithSet | null {
  const row = db.prepare(`${CARD_WITH_SET_SELECT} WHERE c.id = ?`).get(cardId) as
    | CardWithSetRow
    | undefined;
  return row ? mapCardWithSetRow(row) : null;
}

export function getCards(db: Db, cardIds: readonly string[]): Map<string, CardWithSet> {
  const out = new Map<string, CardWithSet>();
  if (cardIds.length === 0) return out;

  // Chunked to stay under SQLite's bound-parameter ceiling.
  for (let i = 0; i < cardIds.length; i += 500) {
    const chunk = cardIds.slice(i, i + 500);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db
      .prepare(`${CARD_WITH_SET_SELECT} WHERE c.id IN (${placeholders})`)
      .all(...chunk) as CardWithSetRow[];
    for (const row of rows) out.set(row.id, mapCardWithSetRow(row));
  }
  return out;
}

export interface SearchOptions {
  query?: string;
  setId?: string;
  limit?: number;
  offset?: number;
}

export function searchCards(db: Db, options: SearchOptions = {}): CardWithSet[] {
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.query?.trim()) {
    const normalized = normalizeName(options.query);
    clauses.push('(c.name_normalized LIKE ? OR c.number_normalized = ?)');
    params.push(`%${normalized}%`, normalizeNumber(options.query));
  }
  if (options.setId) {
    clauses.push('c.set_id = ?');
    params.push(options.setId);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `${CARD_WITH_SET_SELECT} ${where}
       ORDER BY s.release_date DESC, CAST(c.number AS INTEGER), c.number
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as CardWithSetRow[];

  return rows.map(mapCardWithSetRow);
}

/**
 * Narrow the catalog to a plausible shortlist before the (relatively costly)
 * fuzzy ranking runs. A collector number is by far the strongest filter, so
 * it is used whenever the scan produced one; otherwise fall back to the first
 * word of the best-guess name.
 */
export function findScanCandidates(db: Db, parsed: ParsedCardText, limit = 400): CardWithSet[] {
  const rows = new Map<string, CardWithSetRow>();

  if (parsed.number) {
    const byNumber = db
      .prepare(`${CARD_WITH_SET_SELECT} WHERE c.number_normalized = ? LIMIT ?`)
      .all(normalizeNumber(parsed.number), limit) as CardWithSetRow[];
    for (const row of byNumber) rows.set(row.id, row);
  }

  const byNameStatement = db.prepare(
    `${CARD_WITH_SET_SELECT} WHERE c.name_normalized LIKE ? LIMIT ?`,
  );
  const names = parsed.name ? [parsed.name, ...parsed.lines] : parsed.lines;

  for (const candidate of names.slice(0, 4)) {
    const token = normalizeName(candidate).split(' ')[0];
    if (!token || token.length < 3) continue;

    // Substring first, then a short prefix. The prefix pass is what lets a
    // misread like "Charizrd" still reach the fuzzy scorer — an exact
    // substring filter would discard the very typos that scorer exists for.
    for (const pattern of [`%${token}%`, `${token.slice(0, 4)}%`]) {
      for (const row of byNameStatement.all(pattern, limit) as CardWithSetRow[]) {
        rows.set(row.id, row);
      }
      if (rows.size > 0) break;
    }
  }

  // Last resort: the scan produced signals but nothing matched even loosely,
  // which means the error landed in the opening characters. Hand the scorer a
  // bounded slice of the catalog rather than returning nothing at all.
  if (rows.size === 0 && names.length > 0) {
    const fallback = db
      .prepare(`${CARD_WITH_SET_SELECT} LIMIT ?`)
      .all(SCAN_FALLBACK_LIMIT) as CardWithSetRow[];
    for (const row of fallback) rows.set(row.id, row);
  }

  return [...rows.values()].map(mapCardWithSetRow);
}

/** Cap on the brute-force scan fallback; keeps the worst case bounded. */
const SCAN_FALLBACK_LIMIT = 5_000;

export function countCards(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM cards').get() as { count: number }).count;
}
