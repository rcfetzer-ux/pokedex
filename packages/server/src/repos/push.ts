import type { Db } from '../db/index.js';

export interface PushToken {
  token: string;
  platform: string;
  createdAt: number;
  lastSeenAt: number;
}

interface PushTokenRow {
  token: string;
  platform: string;
  created_at: number;
  last_seen_at: number;
}

export function registerPushToken(db: Db, token: string, platform: string): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO push_tokens (token, platform, created_at, last_seen_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET platform = excluded.platform, last_seen_at = excluded.last_seen_at`,
  ).run(token, platform, now, now);
}

export function listPushTokens(db: Db): PushToken[] {
  const rows = db.prepare('SELECT * FROM push_tokens').all() as PushTokenRow[];
  return rows.map((row) => ({
    token: row.token,
    platform: row.platform,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }));
}

/** Called when the push service reports a token as permanently invalid. */
export function deletePushToken(db: Db, token: string): void {
  db.prepare('DELETE FROM push_tokens WHERE token = ?').run(token);
}
