import Database from 'better-sqlite3';

import { MIGRATIONS } from './schema.js';

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  const db = new Database(path);

  // WAL lets the hourly price refresh write while the app reads.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Ingest writes thousands of rows per run; NORMAL is the usual WAL pairing
  // and we can always re-fetch a lost snapshot from the provider.
  db.pragma('synchronous = NORMAL');

  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );`);

  const applied = new Set(
    db
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => (row as { id: string }).id),
  );

  const record = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.id, Date.now());
    })();
  }
}

export function getMeta(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(db: Db, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}
