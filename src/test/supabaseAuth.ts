import { vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

type Listener = (event: string, session: Session | null) => void;

const listeners = new Set<Listener>();
let current: Session | null = null;

/** Builds a minimal Supabase session for tests. */
export function fakeSession(email = 'jane@example.com'): Session {
  return {
    access_token: 'test-jwt',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'auth-1',
      email,
      email_confirmed_at: '2026-10-01T00:00:00Z',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-10-01T00:00:00Z',
    },
  };
}

/**
 * In-memory stand-in for `supabase.auth`. Use with
 * `vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'))`.
 */
export const auth = {
  getSession: vi.fn(async () => ({ data: { session: current }, error: null })),
  onAuthStateChange: vi.fn((listener: Listener) => {
    listeners.add(listener);
    return {
      data: { subscription: { unsubscribe: () => listeners.delete(listener) } },
    };
  }),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(async () => {
    setSession(null);
    return { error: null };
  }),
};

/** Replaces the current session and notifies auth-state listeners. */
export function setSession(session: Session | null) {
  current = session;
  listeners.forEach((l) => l(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}

export function setStoredSession(session: Session | null) {
  current = session;
}

/** Clears the session and every mock between tests. */
export function resetAuth() {
  current = null;
  listeners.clear();
  Object.values(auth).forEach((fn) => fn.mockClear());
  auth.verifyOtp.mockReset();
  auth.updateUser.mockReset();
  auth.signInWithOtp.mockReset();
  auth.signInWithPassword.mockReset();
  auth.signUp.mockReset();
  auth.resend.mockReset();
  auth.resetPasswordForEmail.mockReset();
}

export const supabase = { auth };

export async function getSessionSnapshot() {
  const { data } = await auth.getSession();
  return {
    userId: data.session?.user.id ?? null,
    accessToken: data.session?.access_token ?? null,
  };
}
