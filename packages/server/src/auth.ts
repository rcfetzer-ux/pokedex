import { timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { Config } from './config.js';

/**
 * Routes reachable without a token.
 *
 * `/api/health` stays open so container health checks and load balancers work
 * without being handed a credential. It reveals only liveness and the provider
 * name.
 */
const PUBLIC_API_ROUTES = new Set(['/api/health']);

/** Constant-time compare, so a wrong token cannot be found byte by byte. */
function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function extractToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();

  const apiKey = request.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) return apiKey;

  return null;
}

/**
 * Token authentication for the API.
 *
 * Only applied when API_TOKEN is set: running locally, where the server binds
 * loopback and nobody else can reach it, a mandatory credential is friction
 * with no benefit. The moment the server is exposed, the token is what stands
 * between the internet and someone's collection — so a deployment without one
 * is refused at boot rather than quietly left open.
 *
 * Static assets are deliberately NOT behind this: the app has to load before
 * it can ask the user for a token.
 */
export function registerAuth(app: FastifyInstance, config: Config): void {
  if (!config.apiToken) return;
  const expected = config.apiToken;

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;

    // Strip the query string before matching, or "/api/health?x=1" bypasses.
    const path = request.url.split('?')[0] ?? request.url;
    if (PUBLIC_API_ROUTES.has(path)) return;

    // CORS preflight never carries credentials.
    if (request.method === 'OPTIONS') return;

    const provided = extractToken(request);
    if (!provided || !tokensMatch(provided, expected)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
}

const GENERATE_TOKEN_HINT =
  'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"';

export interface SafetyReport {
  /** Fatal: refuse to start. */
  error: string | null;
  /** Non-fatal but worth saying loudly. */
  warning: string | null;
}

/**
 * Decide whether this configuration is safe to run.
 *
 * The check keys off NODE_ENV rather than the bind address on purpose. The
 * default HOST is 0.0.0.0 because a phone on the same Wi-Fi has to reach the
 * dev server — treating that as "public" would break local development for
 * everyone to catch a case that only matters when deploying. A deployment sets
 * NODE_ENV=production, and there a missing token is fatal.
 */
export function checkDeploymentSafety(config: Config, env = process.env): SafetyReport {
  if (config.apiToken) return { error: null, warning: null };

  if (env.NODE_ENV === 'production') {
    return {
      error:
        'Refusing to start: NODE_ENV=production but API_TOKEN is not set.\n' +
        'Every endpoint would be open — anyone who reaches this server could read ' +
        'and modify the collection, and trigger catalog syncs.\n\n' +
        `Set API_TOKEN to a long random string. ${GENERATE_TOKEN_HINT}`,
      warning: null,
    };
  }

  const boundPublicly = config.host !== '127.0.0.1' && config.host !== 'localhost';
  if (boundPublicly) {
    return {
      error: null,
      warning:
        `API_TOKEN is not set and the server is bound to ${config.host}, so anyone on ` +
        'your network can read and modify your collection. Fine on a trusted home ' +
        'network; set API_TOKEN before exposing this anywhere else.',
    };
  }

  return { error: null, warning: null };
}
