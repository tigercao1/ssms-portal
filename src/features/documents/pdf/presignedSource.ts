import { useCallback, useMemo, useRef } from 'react';

export const PRESIGNED_URL_FRESH_MS = 4 * 60_000;

const MIN_AGE_BEFORE_REFRESH_MS = 30_000;

interface SourceQuery {
  dataUpdatedAt: number;
  refetch: () => Promise<unknown>;
}

export interface SourceRecovery {
  onError: () => void;
  onLoad: () => void;
}

export function useSourceRecovery(query: SourceQuery): SourceRecovery {
  const latest = useRef(query);
  latest.current = query;
  const refreshedSinceLoad = useRef(false);
  const onError = useCallback(() => {
    const { dataUpdatedAt, refetch } = latest.current;
    if (refreshedSinceLoad.current) return;
    if (Date.now() - dataUpdatedAt < MIN_AGE_BEFORE_REFRESH_MS) return;
    refreshedSinceLoad.current = true;
    void refetch();
  }, []);
  const onLoad = useCallback(() => {
    refreshedSinceLoad.current = false;
  }, []);
  return useMemo(() => ({ onError, onLoad }), [onError, onLoad]);
}
