/**
 * Pull the full live catalog — every set, every card — from the configured
 * provider. Run once on a fresh install, then occasionally as new sets release.
 *
 *   PRICE_PROVIDER=pokemontcgio POKEMONTCG_API_KEY=... npm run sync -w @pokedex/server
 */
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';
import { createProvider } from '../providers/index.js';
import { syncCatalog } from '../services/catalog.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const provider = createProvider(config);

  console.log(`syncing catalog from ${provider.name}…`);

  const result = await syncCatalog(db, provider, {
    onProgress: (progress) => {
      const percent = Math.round((progress.index / progress.total) * 100);
      console.log(
        `  [${String(percent).padStart(3)}%] ${progress.setName} (${progress.cards} cards)`,
      );
    },
  });

  console.log(`\n${result.sets} sets, ${result.cards} cards, ${result.prices} price points`);

  if (result.failedSets.length > 0) {
    console.warn(`\n${result.failedSets.length} sets failed and can be retried:`);
    for (const failure of result.failedSets) {
      console.warn(`  ${failure.setId}: ${failure.error}`);
    }
    // Signal partial failure so a cron wrapper can retry.
    process.exitCode = 1;
  }

  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
