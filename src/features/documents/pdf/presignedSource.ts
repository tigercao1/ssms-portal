import { useCallback, useRef } from 'react';

export const PRESIGNED_URL_FRESH_MS = 4 * 60_000;

const MIN_AGE_BEFORE_REFRESH_MS = 30_000;

interface SourceQuery {
  dataUpdatedAt: number;
  refetch: () => Promise<unknown>;
}

export function useRefreshSourceOnError(query: SourceQuery): () => void {
  const latest = useRef(query);
  latest.current = query;
  return useCallback(() => {
    const { dataUpdatedAt, refetch } = latest.current;
    if (Date.now() - dataUpdatedAt >= MIN_AGE_BEFORE_REFRESH_MS) void refetch();
  }, []);
}
