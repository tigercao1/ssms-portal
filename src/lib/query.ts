import { QueryClient } from '@tanstack/react-query';

/** Shared TanStack Query client (W0.3). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
