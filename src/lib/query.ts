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

const owners = new WeakMap<QueryClient, string | null>();

export function bindQueryClientToAccount(
  client: QueryClient,
  userId: string | null,
) {
  owners.set(client, userId);
  return client;
}

export function queryClientAccount(client: QueryClient) {
  return owners.get(client);
}

/** TanStack Query client (W0.3); the session provider creates one per signed-in user. */
export function createQueryClient(userId: string | null = null) {
  return bindQueryClientToAccount(
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: shouldRetryQuery,
          refetchOnWindowFocus: false,
        },
      },
    }),
    userId,
  );
}
