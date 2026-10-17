import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSourceRecovery } from './presignedSource';

const NOW = new Date('2026-10-17T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(updatedAt: number) {
  const refetch = vi.fn(() => Promise.resolve());
  const hook = renderHook(
    ({ dataUpdatedAt }) => useSourceRecovery({ dataUpdatedAt, refetch }),
    { initialProps: { dataUpdatedAt: updatedAt } },
  );
  return { refetch, ...hook };
}

describe('useSourceRecovery', () => {
  it('fetches a new link when the failed one is old enough to have expired', () => {
    const { refetch, result } = setup(NOW - 6 * 60_000);
    result.current.onError();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('leaves a link fetched in the last 30 seconds alone', () => {
    const { refetch, result } = setup(NOW - 10_000);
    result.current.onError();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('refreshes once until a PDF loads, even when each new link fails later', () => {
    const { refetch, result, rerender } = setup(NOW - 6 * 60_000);
    result.current.onError();
    rerender({ dataUpdatedAt: NOW });
    vi.setSystemTime(NOW + 31_000);
    result.current.onError();
    vi.setSystemTime(NOW + 62_000);
    result.current.onError();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('can refresh again after a PDF has loaded', () => {
    const { refetch, result, rerender } = setup(NOW - 6 * 60_000);
    result.current.onError();
    rerender({ dataUpdatedAt: NOW });
    result.current.onLoad();
    vi.setSystemTime(NOW + 6 * 60_000);
    result.current.onError();
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the same handlers across renders', () => {
    const { result, rerender } = setup(NOW);
    const first = result.current;
    rerender({ dataUpdatedAt: NOW + 1 });
    expect(result.current).toBe(first);
  });
});
