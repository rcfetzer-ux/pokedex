import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import type { AppContext } from './context.js';
import { registerRoutes } from './routes/index.js';

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(
  context: AppContext,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 16 * 1024 * 1024,
  });

  // The desktop shell and the Expo web build are separate origins in dev.
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024, files: 1 } });

  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'invalid_request', issues: error.issues });
    }

    const candidate = error as { statusCode?: unknown; name?: string; message?: string };
    const statusCode = typeof candidate.statusCode === 'number' ? candidate.statusCode : 500;
    if (statusCode >= 500) app.log.error(error);

    return reply.code(statusCode).send({
      error: candidate.name ?? 'internal_error',
      message: candidate.message ?? 'Unexpected error',
    });
  });

  app.decorate('appContext', context);
  registerRoutes(app, context);

  return app;
}
