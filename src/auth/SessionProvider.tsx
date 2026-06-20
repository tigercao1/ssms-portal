import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

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
 * sign-in / sign-out / token-refresh propagate to the whole tree. Role +
 * email-verified are derived here for the route guards.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
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
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}
