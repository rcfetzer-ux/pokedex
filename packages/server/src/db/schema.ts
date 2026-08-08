/**
 * Schema. Applied idempotently at boot; each entry runs once and is recorded
 * in `schema_migrations`, so adding a migration later is append-only.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_initial',
    sql: `
    CREATE TABLE IF NOT EXISTS sets (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      series         TEXT NOT NULL DEFAULT '',
      printed_total  INTEGER,
      total          INTEGER,
      release_date   TEXT,
      symbol_image   TEXT,
      logo_image     TEXT,
      ptcgo_code     TEXT,
      updated_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id                TEXT PRIMARY KEY,
      set_id            TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
      name              TEXT NOT NULL,
      number            TEXT NOT NULL,
      rarity            TEXT,
      supertype         TEXT,
      subtypes          TEXT NOT NULL DEFAULT '[]',
      artist            TEXT,
      image_small       TEXT,
      image_large       TEXT,
      variants          TEXT NOT NULL DEFAULT '[]',
      -- Denormalized match keys so scan lookups never normalize at query time.
      name_normalized   TEXT NOT NULL DEFAULT '',
      number_normalized TEXT NOT NULL DEFAULT '',
      updated_at        INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_set ON cards(set_id);
    CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name_normalized);
    CREATE INDEX IF NOT EXISTS idx_cards_number ON cards(number_normalized);

    -- Full price history. One row per card+variant+observation.
    CREATE TABLE IF NOT EXISTS price_snapshots (
      card_id      TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      variant      TEXT NOT NULL,
      ts           INTEGER NOT NULL,
      market_cents INTEGER NOT NULL,
      low_cents    INTEGER,
      mid_cents    INTEGER,
      high_cents   INTEGER,
      currency     TEXT NOT NULL DEFAULT 'USD',
      source       TEXT NOT NULL,
      PRIMARY KEY (card_id, variant, ts)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_lookup
      ON price_snapshots(card_id, variant, ts DESC);

    -- Materialized "current price", so the collection screen is one join.
    CREATE TABLE IF NOT EXISTS card_price_latest (
      card_id      TEXT NOT NULL,
      variant      TEXT NOT NULL,
      ts           INTEGER NOT NULL,
      market_cents INTEGER NOT NULL,
      low_cents    INTEGER,
      mid_cents    INTEGER,
      high_cents   INTEGER,
      currency     TEXT NOT NULL DEFAULT 'USD',
      source       TEXT NOT NULL,
      PRIMARY KEY (card_id, variant)
    );

    -- Materialized trailing-window change, recomputed after every ingest.
    -- Without this, "top movers across every set" would rescan the whole
    -- history table on each request.
    CREATE TABLE IF NOT EXISTS card_price_change (
      card_id      TEXT NOT NULL,
      variant      TEXT NOT NULL,
      window_hours INTEGER NOT NULL,
      from_ts      INTEGER NOT NULL,
      from_cents   INTEGER NOT NULL,
      to_ts        INTEGER NOT NULL,
      to_cents     INTEGER NOT NULL,
      change_cents INTEGER NOT NULL,
      change_ratio REAL NOT NULL,
      direction    TEXT NOT NULL,
      magnitude    TEXT NOT NULL,
      computed_at  INTEGER NOT NULL,
      PRIMARY KEY (card_id, variant, window_hours)
    );

    CREATE INDEX IF NOT EXISTS idx_change_movers
      ON card_price_change(window_hours, magnitude, change_ratio);

    CREATE TABLE IF NOT EXISTS inventory (
      id                   TEXT PRIMARY KEY,
      card_id              TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      variant              TEXT NOT NULL,
      condition            TEXT NOT NULL DEFAULT 'NM',
      grading_company      TEXT,
      grade                REAL,
      quantity             INTEGER NOT NULL DEFAULT 1,
      acquired_price_cents INTEGER,
      acquired_at          TEXT,
      notes                TEXT,
      created_at           INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_card ON inventory(card_id, variant);

    CREATE TABLE IF NOT EXISTS alerts (
      id           TEXT PRIMARY KEY,
      kind         TEXT NOT NULL,
      card_id      TEXT NOT NULL,
      variant      TEXT NOT NULL,
      window_hours INTEGER NOT NULL,
      from_cents   INTEGER NOT NULL,
      to_cents     INTEGER NOT NULL,
      change_cents INTEGER NOT NULL,
      change_ratio REAL NOT NULL,
      direction    TEXT NOT NULL,
      magnitude    TEXT NOT NULL,
      title        TEXT NOT NULL,
      body         TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      read_at      INTEGER,
      pushed_at    INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
    -- Supports the cooldown lookup that stops an ongoing swing from
    -- re-alerting on every refresh for as long as it lasts.
    CREATE INDEX IF NOT EXISTS idx_alerts_dedupe
      ON alerts(card_id, variant, kind, window_hours, created_at DESC);

    CREATE TABLE IF NOT EXISTS push_tokens (
      token        TEXT PRIMARY KEY,
      platform     TEXT NOT NULL DEFAULT 'unknown',
      created_at   INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `,
  },
];
