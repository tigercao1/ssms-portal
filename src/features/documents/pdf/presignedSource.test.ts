import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRefreshSourceOnError } from './presignedSource';

const NOW = new Date('2026-10-17T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRefreshSourceOnError', () => {
  it('fetches a new link when the failed one is old enough to have expired', () => {
    const refetch = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useRefreshSourceOnError({ dataUpdatedAt: NOW - 6 * 60_000, refetch }),
    );
    result.current();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('leaves a link fetched in the last 30 seconds alone', () => {
    const refetch = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useRefreshSourceOnError({ dataUpdatedAt: NOW - 10_000, refetch }),
    );
    result.current();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('uses the latest query when the handler is called after a refetch', () => {
    const refetch = vi.fn(() => Promise.resolve());
    const { result, rerender } = renderHook(
      ({ updatedAt }) =>
        useRefreshSourceOnError({ dataUpdatedAt: updatedAt, refetch }),
      { initialProps: { updatedAt: NOW - 6 * 60_000 } },
    );
    const handler = result.current;
    rerender({ updatedAt: NOW - 5_000 });
    handler();
    expect(refetch).not.toHaveBeenCalled();
  });
});
