import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, fakeSession, resetAuth, setSession } from '@/test/supabaseAuth';
import { SessionProvider } from './SessionProvider';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

const analytics = vi.hoisted(() => ({
  identifyUser: vi.fn(),
  resetUser: vi.fn(),
  track: vi.fn(),
}));
vi.mock('@/lib/analytics', () => analytics);

beforeEach(() => resetAuth());
afterEach(() => vi.clearAllMocks());

describe('SessionProvider analytics identity', () => {
  it('does not reset an anonymous visitor who never signed in', async () => {
    render(<SessionProvider>child</SessionProvider>);
    await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    await act(async () => {});
    act(() => setSession(null));
    await act(async () => {});

    expect(analytics.resetUser).not.toHaveBeenCalled();
    expect(analytics.identifyUser).not.toHaveBeenCalled();
  });

  it('identifies on sign-in and resets once on sign-out', async () => {
    render(<SessionProvider>child</SessionProvider>);

    act(() => setSession(fakeSession()));
    await waitFor(() =>
      expect(analytics.identifyUser).toHaveBeenCalledWith(
        'auth-1',
        'instructor',
      ),
    );

    act(() => setSession(null));
    await waitFor(() => expect(analytics.resetUser).toHaveBeenCalledTimes(1));
  });
});
