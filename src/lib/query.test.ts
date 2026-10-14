import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { queryClient } from './query';

async function attemptsFor(error: Error): Promise<number> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 },
    },
  });
  const queryFn = vi.fn().mockRejectedValue(error);
  await expect(
    client.fetchQuery({ queryKey: ['retry-check'], queryFn }),
  ).rejects.toBe(error);
  return queryFn.mock.calls.length;
}

describe('queryClient retry', () => {
  it('does not retry a forbidden response', async () => {
    expect(await attemptsFor(new ApiError(403, 'Admin role required'))).toBe(1);
  });

  it('does not retry an unauthorized response', async () => {
    expect(await attemptsFor(new ApiError(401, 'Session expired'))).toBe(1);
  });

  it('retries other failures once', async () => {
    expect(await attemptsFor(new ApiError(500, 'Server error'))).toBe(2);
    expect(await attemptsFor(new TypeError('Failed to fetch'))).toBe(2);
  });
});
