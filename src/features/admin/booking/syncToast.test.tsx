import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { fakeClass } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { SyncToastHost } from './CalendarSync';
import { hideSyncToast, SYNC_TOAST_MS, warnIfSyncFailed } from './syncToast';

const message = 'Saved. Google Calendar not updated yet; it will retry.';
const saved = (calendarSync: 'ok' | 'failed') => ({
  ...fakeClass(),
  calendarSync,
  calendarSyncError: calendarSync === 'failed' ? 'network' : null,
});

describe('calendar sync toast', () => {
  afterEach(() => {
    hideSyncToast();
    vi.useRealTimers();
  });

  it('appears only when a saved class failed to sync, then hides itself', () => {
    vi.useFakeTimers();
    renderWithProviders(<SyncToastHost />);
    act(() => warnIfSyncFailed([saved('ok'), saved('ok')]));
    expect(screen.queryByText(message)).not.toBeInTheDocument();

    act(() => warnIfSyncFailed([saved('ok'), saved('failed')]));
    expect(screen.getByText(message)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(SYNC_TOAST_MS - 1));
    expect(screen.getByText(message)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('accepts a single saved class', () => {
    renderWithProviders(<SyncToastHost />);
    act(() => warnIfSyncFailed(saved('failed')));
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
