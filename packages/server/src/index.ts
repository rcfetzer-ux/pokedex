import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import type { AppContext } from './context.js';
import { openDatabase } from './db/index.js';
import { createProvider } from './providers/index.js';
import { createScheduler } from './scheduler.js';
import { TesseractOcrEngine } from './services/ocr.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const provider = createProvider(config);

  const context: AppContext = {
    db,
    config,
    provider,
    ocr: new TesseractOcrEngine({ langPath: process.env.TESSDATA_PATH ?? null }),
  };

  const app = await buildApp(context, { logger: true });
  const scheduler = createScheduler(context, app.log);

  if (!config.disableScheduler) scheduler.start();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    scheduler.stop();
    await app.close();
    await context.ocr.dispose();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    { provider: provider.name, database: config.databasePath },
    'pokedex server listening',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
