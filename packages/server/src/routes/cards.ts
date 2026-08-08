import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { PRICE_VARIANTS, type PriceVariant } from '@pokedex/shared';

import type { AppContext } from '../context.js';
import { getCard, listSets, searchCards } from '../repos/cards.js';
import { getChange, getHistory, getLatestPricesForCard } from '../repos/prices.js';

const searchQuery = z.object({
  q: z.string().optional(),
  setId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const historyQuery = z.object({
  variant: z.enum(PRICE_VARIANTS).optional(),
  days: z.coerce.number().int().min(1).max(400).default(30),
});

export function registerCardRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/api/sets', async () => ({ sets: listSets(context.db) }));

  app.get('/api/cards', async (request) => {
    const query = searchQuery.parse(request.query);
    const cards = searchCards(context.db, {
      query: query.q,
      setId: query.setId,
      limit: query.limit,
      offset: query.offset,
    });
    return { cards };
  });

  app.get('/api/cards/:cardId', async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const card = getCard(context.db, cardId);
    if (!card) return reply.code(404).send({ error: 'card_not_found', cardId });

    const windowHours = context.config.swingWindowsHours;
    const prices = getLatestPricesForCard(context.db, cardId);

    return {
      card,
      prices: prices.map((price) => ({
        ...price,
        changes: Object.fromEntries(
          windowHours.map((hours) => [hours, getChange(context.db, cardId, price.variant, hours)]),
        ),
      })),
    };
  });

  app.get('/api/cards/:cardId/history', async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const query = historyQuery.parse(request.query);

    const card = getCard(context.db, cardId);
    if (!card) return reply.code(404).send({ error: 'card_not_found', cardId });

    const since = Date.now() - query.days * 24 * 60 * 60 * 1000;
    const variants: PriceVariant[] = query.variant ? [query.variant] : card.variants;

    return {
      cardId,
      days: query.days,
      series: variants.map((variant) => ({
        variant,
        points: getHistory(context.db, cardId, variant, since),
      })),
    };
  });
}
