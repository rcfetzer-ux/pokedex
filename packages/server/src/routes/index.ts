import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../context.js';
import { registerAlertRoutes } from './alerts.js';
import { registerCardRoutes } from './cards.js';
import { registerInventoryRoutes } from './inventory.js';
import { registerMoverRoutes } from './movers.js';
import { registerScanRoutes } from './scan.js';
import { registerSystemRoutes } from './system.js';

export function registerRoutes(app: FastifyInstance, context: AppContext): void {
  registerSystemRoutes(app, context);
  registerCardRoutes(app, context);
  registerScanRoutes(app, context);
  registerInventoryRoutes(app, context);
  registerMoverRoutes(app, context);
  registerAlertRoutes(app, context);
}
