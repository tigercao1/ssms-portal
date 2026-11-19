import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, fakeSession, resetAuth, setSession } from '@/test/supabaseAuth';
import { SessionProvider, useSession } from './SessionProvider';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

const analytics = vi.hoisted(() => ({
  identifyUser: vi.fn(),
  resetUser: vi.fn(),
  track: vi.fn(),
}));
vi.mock('@/lib/analytics', () => analytics);

let queryClient: QueryClient;

beforeEach(() => {
  resetAuth();
  queryClient = new QueryClient();
});
afterEach(() => vi.clearAllMocks());

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function sessionFor(id: string): Session {
  const base = fakeSession(`${id}@example.com`);
  return { ...base, user: { ...base.user, id } };
}

function SignOutButton() {
  const { signOut } = useSession();
  return (
    <button type="button" onClick={() => void signOut()}>
      Sign out
    </button>
  );
}

const cachedProfile = () => queryClient.getQueryData(['me', 'instructor']);

describe('SessionProvider analytics identity', () => {
  it('does not reset an anonymous visitor who never signed in', async () => {
    render(<SessionProvider>child</SessionProvider>, { wrapper: Providers });
    await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    await act(async () => {});
    act(() => setSession(null));
    await act(async () => {});

    expect(analytics.resetUser).not.toHaveBeenCalled();
    expect(analytics.identifyUser).not.toHaveBeenCalled();
  });

  it('identifies on sign-in and resets once on sign-out', async () => {
    render(<SessionProvider>child</SessionProvider>, { wrapper: Providers });

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

describe('SessionProvider query cache', () => {
  it('clears cached data on sign-out', async () => {
    setSession(sessionFor('user-a'));
    render(
      <SessionProvider>
        <SignOutButton />
      </SessionProvider>,
      { wrapper: Providers },
    );
    await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    queryClient.setQueryData(['me', 'instructor'], { name: 'A' });

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect(cachedProfile()).toBeUndefined();
  });

  it('clears cached data when another user signs in without a sign-out', async () => {
    render(<SessionProvider>child</SessionProvider>, { wrapper: Providers });
    await act(async () => {});
    act(() => setSession(sessionFor('user-a')));
    await act(async () => {});
    queryClient.setQueryData(['me', 'instructor'], { name: 'A' });

    act(() => setSession(sessionFor('user-b')));

    expect(cachedProfile()).toBeUndefined();
  });

  it('keeps cached data when the same user refreshes their session', async () => {
    render(<SessionProvider>child</SessionProvider>, { wrapper: Providers });
    await act(async () => {});
    act(() => setSession(sessionFor('user-a')));
    await act(async () => {});
    queryClient.setQueryData(['me', 'instructor'], { name: 'A' });

    act(() =>
      setSession({ ...sessionFor('user-a'), access_token: 'refreshed' }),
    );

    expect(cachedProfile()).toEqual({ name: 'A' });
  });
});
