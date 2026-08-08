/**
 * Hands the renderer the API URL that the main process just chose.
 *
 * The port is picked at runtime, so it cannot be baked into the web bundle at
 * build time. Exposing it here means the same static export works unchanged in
 * a browser, on a phone and inside this shell.
 */
const { contextBridge } = require('electron');

const flag = process.argv.find((argument) => argument.startsWith('--pokedex-api-url='));
const apiUrl = flag ? flag.slice('--pokedex-api-url='.length) : null;

if (apiUrl) {
  contextBridge.exposeInMainWorld('__POKEDEX_API_URL__', apiUrl);
}

contextBridge.exposeInMainWorld('__POKEDEX_DESKTOP__', true);
