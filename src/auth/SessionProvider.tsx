import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, queryClientAccount } from '@/lib/query';
import { bindRequestsToAccount } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { identifyUser, resetUser, track } from '@/lib/analytics';

interface SessionValue {
  session: Session | null;
  user: User | null;
  /** Server-set role from the verified JWT app_metadata (ADMIN_ROLE_PLAN.md). */
  role: 'admin' | 'instructor' | null;
  isAdmin: boolean;
  emailVerified: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function readRole(user: User | null): 'admin' | 'instructor' | null {
  const role = user?.app_metadata?.role;
  if (role === 'admin') return 'admin';
  return user ? 'instructor' : null;
}

/**
 * Owns the Supabase auth session (W1.4). Subscribes to auth-state changes so
 * sign-in / sign-out / token-refresh propagate to the whole tree, and gives the
 * tree a fresh query client, bound to API requests, whenever the signed-in user
 * changes (here or in another tab).
 * Role + email-verified are derived here for the route guards.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [queryClient, setQueryClient] = useState(() => createQueryClient());
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const clientUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    function apply(next: Session | null) {
      if (!active) return;
      const nextUserId = next?.user?.id ?? null;
      if (clientUserId.current !== nextUserId)
        setQueryClient(createQueryClient(nextUserId));
      clientUserId.current = nextUserId;
      setSession(next);
      setLoading(false);
    }
    function onStorage(e: StorageEvent) {
      if (e.key && !e.key.startsWith('sb-')) return;
      supabase.auth.getSession().then(({ data }) => apply(data.session));
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) =>
      apply(next),
    );
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      sub.subscription.unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useLayoutEffect(() => {
    if (loading) return;
    bindRequestsToAccount(queryClientAccount(queryClient));
    return () => bindRequestsToAccount(undefined);
  }, [queryClient, loading]);

  const userId = session?.user?.id ?? null;
  const role = readRole(session?.user ?? null);
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (userId && role) identifyUser(userId, role);
    else if (identifiedUserId.current) resetUser();
    identifiedUserId.current = userId;
  }, [userId, role, loading]);

  const signOut = useCallback(async () => {
    track('signed_out');
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<SessionValue>(() => {
    const user = session?.user ?? null;
    return {
      session,
      user,
      role: readRole(user),
      isAdmin: readRole(user) === 'admin',
      emailVerified: Boolean(user?.email_confirmed_at),
      loading,
      signOut,
    };
  }, [session, loading, signOut]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={value}>
        {children}
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}
