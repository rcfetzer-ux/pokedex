import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppContext } from '../context.js';
import { getMeta } from '../db/index.js';
import { countCards, listSets } from '../repos/cards.js';
import { syncCatalog } from '../services/catalog.js';
import { refreshPrices } from '../services/prices.js';

const syncBody = z.object({ setIds: z.array(z.string()).optional() }).default({});

export function registerSystemRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/api/health', async () => ({ ok: true, provider: context.provider.name }));

  app.get('/api/status', async () => {
    const lastSync = getMeta(context.db, 'catalog:last_sync_at');
    const lastRefresh = getMeta(context.db, 'prices:last_refresh_at');
    return {
      provider: context.provider.name,
      sets: listSets(context.db).length,
      cards: countCards(context.db),
      lastCatalogSyncAt: lastSync ? Number(lastSync) : null,
      lastPriceRefreshAt: lastRefresh ? Number(lastRefresh) : null,
      priceRefreshMinutes: context.config.priceRefreshMinutes,
      swingWindowsHours: context.config.swingWindowsHours,
      notifyAtOrAbove: context.config.notifyAtOrAbove,
    };
  });

  /**
   * Kicked off manually. A full catalog sync is minutes of paged requests
   * against a rate-limited API, so it is never run implicitly on boot.
   */
  app.post('/api/admin/sync', async (request) => {
    const body = syncBody.parse(request.body ?? {});
    return syncCatalog(context.db, context.provider, { setIds: body.setIds });
  });

  app.post('/api/admin/refresh-prices', async (request) => {
    const body = syncBody.parse(request.body ?? {});
    const result = await refreshPrices(context.db, context.provider, context.config, {
      setIds: body.setIds,
    });
    // Alert objects can be numerous; the count is what a caller needs here.
    return { ...result, alerts: result.alerts.length };
  });
}
