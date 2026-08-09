import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { registerAuth } from './auth.js';
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

  // Auth is registered before the routes so no handler can run without it.
  registerAuth(app, context.config);

  app.decorate('appContext', context);
  registerRoutes(app, context);

  await registerWebApp(app, context);

  return app;
}

/**
 * Serve the exported web build from the API when one is present, so a
 * deployment is a single origin and a single process: no CORS, no
 * mixed-content risk, and no second URL to configure.
 *
 * Assets are served without auth on purpose — the app has to load before it
 * can prompt for a token.
 */
async function registerWebApp(app: FastifyInstance, context: AppContext): Promise<void> {
  const root = context.config.webRoot;
  if (!root) return;

  await app.register(fastifyStatic, { root, wildcard: false });

  app.setNotFoundHandler((request, reply) => {
    // Unknown /api paths are genuine 404s; anything else is a client route
    // that only exists once the single-page app has booted.
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not_found', path: request.url });
    }
    return reply.sendFile('index.html');
  });

  app.log.info({ webRoot: root }, 'serving web app');
}
