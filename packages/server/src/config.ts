import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { DEFAULT_THRESHOLDS, type SwingMagnitude, type SwingThresholds } from '@pokedex/shared';

export type ProviderName = 'pokemontcgio' | 'fixture';

export interface Config {
  port: number;
  host: string;
  databasePath: string;
  provider: ProviderName;
  /** pokemontcg.io works without a key but is heavily rate limited. */
  pokemonTcgApiKey: string | null;
  /** How often to pull fresh prices, in minutes. */
  priceRefreshMinutes: number;
  /** Skip the scheduler entirely (tests, one-off CLI runs). */
  disableScheduler: boolean;
  thresholds: SwingThresholds;
  /** Minimum magnitude that produces an alert + push for cards you own. */
  notifyAtOrAbove: SwingMagnitude;
  /**
   * Cards you do NOT own always appear in the movers list; set this to also
   * push notifications for them. Off by default — the whole market moving is
   * a feed to browse, not something to interrupt someone for.
   */
  notifyOnMarketMovers: boolean;
  marketAlertMinMagnitude: SwingMagnitude;
  /** Cap on market-mover alerts generated per refresh. */
  marketAlertLimit: number;
  /**
   * Suppress repeat alerts for the same card+variant within this many hours.
   * A 30% swing stays a 30% swing for the whole trailing window, so without a
   * cooldown one move would re-notify on every refresh.
   */
  alertCooldownHours: number;
  /** Snapshots older than this are pruned to bound database growth. */
  historyRetentionDays: number;
  /** Windows the UI can ask for; the first is the default. */
  swingWindowsHours: number[];
  /** Market movers must be at least this valuable to be worth surfacing. */
  moversMinPriceCents: number;
  /** Cap on how many cards a single price refresh will pull. 0 = no cap. */
  priceRefreshLimit: number;
  /**
   * Shared secret required on every /api route. Null disables auth entirely,
   * which is the sensible default for a server bound to your own machine and
   * fatal in production (see checkDeploymentSafety).
   */
  apiToken: string | null;
  /**
   * Directory holding the exported web build. When present the API also serves
   * the UI, so a deployment is one origin and one process.
   */
  webRoot: string | null;
}

function num(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

/**
 * Locate the exported web build. An explicit WEB_ROOT wins; otherwise fall back
 * to the app package's default export directory, which is where it lands in the
 * Docker image and in a local `npm run export:web`.
 */
function resolveWebRoot(explicit: string | undefined): string | null {
  const candidates = explicit
    ? [explicit]
    : [resolve('./web'), resolve('../app/dist'), resolve('../../app/dist')];

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (existsSync(join(resolved, 'index.html'))) return resolved;
  }
  return null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider: ProviderName = env.PRICE_PROVIDER === 'pokemontcgio' ? 'pokemontcgio' : 'fixture';

  const databasePath = resolve(env.DATABASE_PATH ?? './data/pokedex.db');
  mkdirSync(dirname(databasePath), { recursive: true });

  const thresholds: SwingThresholds = {
    ...DEFAULT_THRESHOLDS,
    floorCents: num(env.SWING_FLOOR_CENTS, DEFAULT_THRESHOLDS.floorCents),
    ratioMajor: num(env.SWING_RATIO_MAJOR, DEFAULT_THRESHOLDS.ratioMajor),
    ratioExtreme: num(env.SWING_RATIO_EXTREME, DEFAULT_THRESHOLDS.ratioExtreme),
  };

  return {
    port: num(env.PORT, 4000),
    host: env.HOST ?? '0.0.0.0',
    databasePath,
    provider,
    pokemonTcgApiKey: env.POKEMONTCG_API_KEY ?? null,
    priceRefreshMinutes: num(env.PRICE_REFRESH_MINUTES, 60),
    disableScheduler: bool(env.DISABLE_SCHEDULER, false),
    thresholds,
    notifyAtOrAbove: (env.NOTIFY_AT_OR_ABOVE as SwingMagnitude) ?? 'major',
    notifyOnMarketMovers: bool(env.NOTIFY_ON_MARKET_MOVERS, false),
    marketAlertMinMagnitude: (env.MARKET_ALERT_MIN_MAGNITUDE as SwingMagnitude) ?? 'extreme',
    marketAlertLimit: num(env.MARKET_ALERT_LIMIT, 10),
    alertCooldownHours: num(env.ALERT_COOLDOWN_HOURS, 12),
    historyRetentionDays: num(env.HISTORY_RETENTION_DAYS, 400),
    swingWindowsHours: (env.SWING_WINDOWS ?? '24,168')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value) && value > 0),
    moversMinPriceCents: num(env.MOVERS_MIN_PRICE_CENTS, 200),
    priceRefreshLimit: num(env.PRICE_REFRESH_LIMIT, 0),
    apiToken: env.API_TOKEN?.trim() ? env.API_TOKEN.trim() : null,
    webRoot: resolveWebRoot(env.WEB_ROOT),
  };
}
