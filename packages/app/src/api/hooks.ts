import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from './client';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True only on the first load, so refreshes do not blank the screen. */
  initialLoading: boolean;
  reload: () => Promise<void>;
}

/**
 * Minimal data hook: fetch on mount, expose a reload for pull-to-refresh.
 *
 * Deliberately not a caching library — every screen here wants live prices on
 * view, and a stale-while-revalidate cache would show yesterday's valuation on
 * an app whose entire point is the current number.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);

  // Guards against setting state after unmount, and against an earlier slow
  // response overwriting a later fast one.
  const mounted = useRef(true);
  const requestId = useRef(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;

    setLoading(true);
    try {
      const result = await loaderRef.current();
      if (!mounted.current || requestId.current !== id) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (!mounted.current || requestId.current !== id) return;
      setError(describeError(caught));
    } finally {
      if (mounted.current && requestId.current === id) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mounted.current = true;
    void run();
    return () => {
      mounted.current = false;
    };
  }, [run]);

  return { data, error, loading, initialLoading, reload: run };
}

export function describeError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.status === 0) return 'Cannot reach the server.';
    return caught.message;
  }
  if (caught instanceof TypeError) {
    // fetch throws TypeError when the host is unreachable — by far the most
    // common failure here, and "Network request failed" tells nobody anything.
    return 'Cannot reach the server. Is it running, and is the API URL right?';
  }
  return caught instanceof Error ? caught.message : String(caught);
}
