import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { CONDITIONS, GRADING_COMPANIES, PRICE_VARIANTS } from '@pokedex/shared';

import type { AppContext } from '../context.js';
import { getCard } from '../repos/cards.js';
import {
  addInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  updateInventoryItem,
} from '../repos/inventory.js';
import { getCollection } from '../services/collection.js';

const createBody = z.object({
  cardId: z.string().min(1),
  variant: z.enum(PRICE_VARIANTS),
  condition: z.enum(CONDITIONS).default('NM'),
  gradingCompany: z.enum(GRADING_COMPANIES).nullish(),
  grade: z.number().min(1).max(10).nullish(),
  quantity: z.number().int().min(1).max(9_999).default(1),
  acquiredPriceCents: z.number().int().min(0).nullish(),
  acquiredAt: z.string().nullish(),
  notes: z.string().max(1_000).nullish(),
});

const updateBody = createBody.partial().omit({ cardId: true });

export function registerInventoryRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/api/collection', async (request) => {
    const query = z
      .object({ windowHours: z.coerce.number().int().min(1).max(8_760).default(24) })
      .parse(request.query);
    return getCollection(context.db, query.windowHours);
  });

  app.post('/api/inventory', async (request, reply) => {
    const body = createBody.parse(request.body);

    // Reject unknown cards up front: a foreign-key failure surfaces as a 500,
    // and "you scanned a card we have not synced yet" deserves a real message.
    if (!getCard(context.db, body.cardId)) {
      return reply.code(404).send({ error: 'card_not_found', cardId: body.cardId });
    }

    const item = addInventoryItem(context.db, {
      cardId: body.cardId,
      variant: body.variant,
      condition: body.condition,
      gradingCompany: body.gradingCompany ?? null,
      grade: body.grade ?? null,
      quantity: body.quantity,
      acquiredPriceCents: body.acquiredPriceCents ?? null,
      acquiredAt: body.acquiredAt ?? null,
      notes: body.notes ?? null,
    });

    return reply.code(201).send({ item });
  });

  app.patch('/api/inventory/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!getInventoryItem(context.db, id)) {
      return reply.code(404).send({ error: 'inventory_item_not_found', id });
    }

    const body = updateBody.parse(request.body);
    const item = updateInventoryItem(context.db, id, {
      ...body,
      gradingCompany: body.gradingCompany ?? undefined,
      grade: body.grade ?? undefined,
      acquiredPriceCents: body.acquiredPriceCents ?? undefined,
      acquiredAt: body.acquiredAt ?? undefined,
      notes: body.notes ?? undefined,
    });

    return { item };
  });

  app.delete('/api/inventory/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!deleteInventoryItem(context.db, id)) {
      return reply.code(404).send({ error: 'inventory_item_not_found', id });
    }
    return reply.code(204).send();
  });
}
