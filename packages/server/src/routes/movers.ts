import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { magnitudeRank, type SwingMagnitude } from '@pokedex/shared';

import type { AppContext } from '../context.js';
import { getCards } from '../repos/cards.js';
import { queryMovers } from '../repos/prices.js';

const ALL_MAGNITUDES: SwingMagnitude[] = ['none', 'minor', 'notable', 'major', 'extreme'];

const moversQuery = z.object({
  windowHours: z.coerce.number().int().min(1).max(8_760).default(24),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  direction: z.enum(['up', 'down', 'both']).default('both'),
  minMagnitude: z.enum(['none', 'minor', 'notable', 'major', 'extreme']).default('major'),
  /** Default false: the point of this feed is cards you do NOT already hold. */
  includeOwned: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  minPriceCents: z.coerce.number().int().min(0).optional(),
});

export function registerMoverRoutes(app: FastifyInstance, context: AppContext): void {
  /**
   * Market movers: the biggest swings across the whole catalog, excluding the
   * user's own cards by default — those are covered by the collection view and
   * by alerts, so repeating them here would just crowd out what is new.
   */
  app.get('/api/movers', async (request) => {
    const query = moversQuery.parse(request.query);

    const allowed = ALL_MAGNITUDES.filter(
      (magnitude) => magnitudeRank(magnitude) >= magnitudeRank(query.minMagnitude),
    );

    const movers = queryMovers(context.db, {
      windowHours: query.windowHours,
      limit: query.limit,
      direction: query.direction,
      minMagnitude: allowed,
      excludeOwned: !query.includeOwned,
      minPriceCents: query.minPriceCents ?? context.config.moversMinPriceCents,
    });

    const cards = getCards(context.db, [...new Set(movers.map((mover) => mover.cardId))]);

    return {
      windowHours: query.windowHours,
      movers: movers
        .map((mover) => {
          const card = cards.get(mover.cardId);
          return card ? { card, variant: mover.variant, change: mover.change } : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    };
  });
}
