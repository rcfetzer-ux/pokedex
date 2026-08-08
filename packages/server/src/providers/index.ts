import type { Config } from '../config.js';
import { FixtureProvider } from './fixture.js';
import { PokemonTcgIoProvider } from './pokemontcgio.js';
import type { CardDataProvider } from './types.js';

export { FixtureProvider } from './fixture.js';
export { PokemonTcgIoProvider } from './pokemontcgio.js';
export type { CardDataProvider, ProviderCard, ProviderPrice } from './types.js';

export function createProvider(config: Config): CardDataProvider {
  if (config.provider === 'pokemontcgio') {
    return new PokemonTcgIoProvider({ apiKey: config.pokemonTcgApiKey });
  }
  return new FixtureProvider();
}
