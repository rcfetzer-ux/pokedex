import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AlertWithCard } from '@pokedex/shared';

import type { AppContext } from '../context.js';
import {
  countUnreadAlerts,
  listAlerts,
  markAlertRead,
  markAllAlertsRead,
} from '../repos/alerts.js';
import { getCards } from '../repos/cards.js';
import { registerPushToken } from '../repos/push.js';
import { deliverPendingAlerts } from '../services/push.js';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  kind: z.enum(['inventory_swing', 'market_swing']).optional(),
});

const registerBody = z.object({
  token: z.string().min(10),
  platform: z.enum(['ios', 'android', 'web', 'desktop', 'unknown']).default('unknown'),
});

export function registerAlertRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/api/alerts', async (request) => {
    const query = listQuery.parse(request.query);
    const alerts = listAlerts(context.db, {
      limit: query.limit,
      unreadOnly: query.unreadOnly,
      kind: query.kind,
    });

    const cards = getCards(context.db, [...new Set(alerts.map((alert) => alert.cardId))]);
    const withCards: AlertWithCard[] = alerts.map((alert) => ({
      ...alert,
      card: cards.get(alert.cardId) ?? null,
    }));

    return { alerts: withCards, unread: countUnreadAlerts(context.db) };
  });

  app.post('/api/alerts/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updated = markAlertRead(context.db, id);
    if (!updated) return reply.code(404).send({ error: 'alert_not_found', id });
    return { ok: true, unread: countUnreadAlerts(context.db) };
  });

  app.post('/api/alerts/read-all', async () => ({
    ok: true,
    marked: markAllAlertsRead(context.db),
  }));

  /** Devices register here so pushes reach them; re-registering is idempotent. */
  app.post('/api/push/register', async (request) => {
    const body = registerBody.parse(request.body);
    registerPushToken(context.db, body.token, body.platform);
    return { ok: true };
  });

  /** Manual flush, mainly for testing delivery without waiting for the job. */
  app.post('/api/push/flush', async () => deliverPendingAlerts(context.db));
}
