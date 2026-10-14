import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  ) {
    return false;
  }
  return failureCount < 1;
}

/** Shared TanStack Query client (W0.3). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
  },
});
