import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pokedex.apiToken';

/**
 * The API token, cached in memory so every request does not hit storage.
 *
 * A single shared secret rather than accounts: this is one person's collection
 * on their own server. The token is stored with AsyncStorage — on web that is
 * localStorage, which is readable by any script on the origin. Acceptable here
 * because the app is served from that same origin and there is no third-party
 * script on the page; it would not be if either changed.
 */
let cachedToken: string | null = null;
let loaded = false;

export async function loadToken(): Promise<string | null> {
  if (loaded) return cachedToken;
  try {
    cachedToken = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode, quota) — the user can re-enter it.
    cachedToken = null;
  }
  loaded = true;
  return cachedToken;
}

export function getCachedToken(): string | null {
  return cachedToken;
}

export async function saveToken(token: string): Promise<void> {
  cachedToken = token;
  loaded = true;
  await AsyncStorage.setItem(STORAGE_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  loaded = true;
  await AsyncStorage.removeItem(STORAGE_KEY);
}
