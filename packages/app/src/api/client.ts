import Constants from 'expo-constants';

import { getCachedToken } from './auth';

import type {
  AlertWithCard,
  CardWithSet,
  InventoryItemWithValue,
  ParsedCardText,
  PriceChange,
  PricePoint,
  PriceVariant,
  ScanCandidate,
} from '@pokedex/shared';

export const DEFAULT_API_PORT = 4000;

/** Set by the desktop shell before the bundle loads. */
declare global {
  // eslint-disable-next-line no-var
  var __POKEDEX_API_URL__: string | undefined;
}

/**
 * Resolve the API base URL, most specific source first:
 *
 *  1. A runtime global — how the desktop shell points the packaged web build
 *     at the API it just spawned, with no rebuild.
 *  2. EXPO_PUBLIC_API_URL, baked in at build time for real deployments.
 *  3. The Expo dev server's own host. `localhost` is right on web and on a
 *     simulator but means "the phone itself" on a physical device, and the
 *     dev server runs on the same machine as the API — so borrow its address.
 *  4. localhost, for the plain local case.
 */
function resolveBaseUrl(): string {
  const runtime = globalThis.__POKEDEX_API_URL__;
  if (runtime) return runtime.replace(/\/$/, '');

  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;

  // A web build with no hostUri was not served by the Expo dev server, which
  // means the API is serving it — the single-host deployment. Same origin, so
  // no cross-origin request and no mixed content whatever the domain is.
  if (!hostUri && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }

  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${DEFAULT_API_PORT}`;

  return `http://localhost:${DEFAULT_API_PORT}`;
}

export const API_BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown on 401 so the UI can show the token prompt instead of an error. */
export class UnauthorizedError extends ApiError {
  constructor() {
    super('This server needs an access token.', 401, 'unauthorized');
    this.name = 'UnauthorizedError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getCachedToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(body.message ?? body.error ?? response.statusText, response.status, body.error);
  }
  return body as T;
}

export interface StatusResponse {
  provider: string;
  sets: number;
  cards: number;
  lastCatalogSyncAt: number | null;
  lastPriceRefreshAt: number | null;
  /** Oldest price snapshot held; null when nothing has been recorded yet. */
  historyStartedAt: number | null;
  swingWindowsHours: number[];
  notifyAtOrAbove: string;
}

export interface CollectionSummary {
  items: number;
  copies: number;
  distinctCards: number;
  totalValueCents: number;
  totalCostCents: number;
  gainCents: number;
  change24hCents: number;
  unpricedCopies: number;
}

export interface CollectionResponse {
  items: InventoryItemWithValue[];
  summary: CollectionSummary;
}

export interface Mover {
  card: CardWithSet;
  variant: PriceVariant;
  change: PriceChange;
}

export interface ScanResponse {
  parsed: ParsedCardText;
  candidates: ScanCandidate[];
  text: string;
  autoAcceptable: boolean;
}

export interface CardDetailResponse {
  card: CardWithSet;
  prices: (PricePoint & { changes: Record<string, PriceChange | null> })[];
}

export interface HistoryResponse {
  cardId: string;
  days: number;
  series: { variant: PriceVariant; points: PricePoint[] }[];
}

export interface AddInventoryInput {
  cardId: string;
  variant: PriceVariant;
  condition?: string;
  gradingCompany?: string | null;
  grade?: number | null;
  quantity?: number;
  acquiredPriceCents?: number | null;
  notes?: string | null;
}

export const api = {
  status: () => request<StatusResponse>('/api/status'),

  /** 200 means the current token is accepted, or that none is required. */
  authCheck: () => request<{ ok: boolean; authRequired: boolean }>('/api/auth/check'),

  collection: (windowHours = 24) =>
    request<CollectionResponse>(`/api/collection?windowHours=${windowHours}`),

  movers: (params: { windowHours?: number; limit?: number; direction?: string; minMagnitude?: string } = {}) => {
    const query = new URLSearchParams({
      windowHours: String(params.windowHours ?? 24),
      limit: String(params.limit ?? 30),
      direction: params.direction ?? 'both',
      minMagnitude: params.minMagnitude ?? 'major',
    });
    return request<{ windowHours: number; movers: Mover[] }>(`/api/movers?${query}`);
  },

  alerts: (unreadOnly = false) =>
    request<{ alerts: AlertWithCard[]; unread: number }>(
      `/api/alerts?unreadOnly=${unreadOnly ? 'true' : 'false'}`,
    ),

  markAlertRead: (id: string) =>
    request<{ ok: boolean; unread: number }>(`/api/alerts/${id}/read`, { method: 'POST' }),

  markAllAlertsRead: () => request<{ ok: boolean }>('/api/alerts/read-all', { method: 'POST' }),

  searchCards: (query: string) =>
    request<{ cards: CardWithSet[] }>(`/api/cards?q=${encodeURIComponent(query)}&limit=40`),

  card: (cardId: string) => request<CardDetailResponse>(`/api/cards/${cardId}`),

  history: (cardId: string, days = 30, variant?: PriceVariant) =>
    request<HistoryResponse>(
      `/api/cards/${cardId}/history?days=${days}${variant ? `&variant=${variant}` : ''}`,
    ),

  scanText: (text: string) =>
    request<ScanResponse>('/api/scan', { method: 'POST', body: JSON.stringify({ text }) }),

  scanImage: (imageBase64: string) =>
    request<ScanResponse>('/api/scan', {
      method: 'POST',
      body: JSON.stringify({ imageBase64 }),
    }),

  addToInventory: (input: AddInventoryInput) =>
    request<{ item: InventoryItemWithValue }>('/api/inventory', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateInventory: (id: string, input: Partial<AddInventoryInput>) =>
    request<{ item: InventoryItemWithValue }>(`/api/inventory/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  removeFromInventory: (id: string) =>
    request<void>(`/api/inventory/${id}`, { method: 'DELETE' }),

  /** Pulls every set and card from the configured provider. Minutes, not seconds. */
  syncCatalog: () =>
    request<{ sets: number; cards: number; failedSets: { setId: string }[] }>('/api/admin/sync', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  refreshPrices: () =>
    request<{ snapshots: number; alerts: number }>('/api/admin/refresh-prices', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  registerPushToken: (token: string, platform: string) =>
    request<{ ok: boolean }>('/api/push/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    }),
};
