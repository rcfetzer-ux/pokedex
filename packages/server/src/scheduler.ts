import type { FastifyBaseLogger } from 'fastify';

import type { AppContext } from './context.js';
import { refreshPrices } from './services/prices.js';
import { deliverPendingAlerts } from './services/push.js';

export interface Scheduler {
  start(): void;
  stop(): void;
  /** Run one cycle now; exposed so tests and CLI callers can drive it. */
  runOnce(): Promise<void>;
}

export function createScheduler(context: AppContext, logger: FastifyBaseLogger): Scheduler {
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function runOnce(): Promise<void> {
    // A slow refresh must not overlap the next tick and double-write history.
    if (running) {
      logger.warn('price refresh still running, skipping this tick');
      return;
    }
    running = true;
    try {
      const result = await refreshPrices(context.db, context.provider, context.config);
      logger.info(
        {
          sets: result.sets,
          snapshots: result.snapshots,
          changes: result.changes,
          alerts: result.alerts.length,
          failed: result.failedSets.length,
          durationMs: result.durationMs,
        },
        'price refresh complete',
      );

      const push = await deliverPendingAlerts(context.db);
      if (push.sent > 0 || push.errors.length > 0) {
        logger.info({ sent: push.sent, errors: push.errors.length }, 'push delivery complete');
      }
    } catch (error) {
      logger.error({ err: error }, 'price refresh failed');
    } finally {
      running = false;
    }
  }

  return {
    runOnce,
    start() {
      if (timer) return;
      const intervalMs = context.config.priceRefreshMinutes * 60 * 1000;
      timer = setInterval(() => void runOnce(), intervalMs);
      // Do not hold the process open on this timer alone.
      timer.unref();
      logger.info({ intervalMinutes: context.config.priceRefreshMinutes }, 'scheduler started');
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}
