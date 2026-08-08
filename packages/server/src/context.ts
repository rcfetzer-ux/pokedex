import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { CardDataProvider } from './providers/index.js';
import type { OcrEngine } from './services/ocr.js';

/** Everything a route handler needs, injected once at construction. */
export interface AppContext {
  db: Db;
  config: Config;
  provider: CardDataProvider;
  ocr: OcrEngine;
}
