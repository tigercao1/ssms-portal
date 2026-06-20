import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/auth/SessionProvider';
import { Spinner } from '@/components';

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

/** Redirects to /login when there is no Supabase session (W1.4). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!session)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Redirects to /verify-email until the email is confirmed (W1.4). */
export function RequireEmailVerified({ children }: { children: ReactNode }) {
  const { emailVerified, loading } = useSession();
  if (loading) return <FullPageLoader />;
  if (!emailVerified) return <Navigate to="/verify-email" replace />;
  return <>{children}</>;
}

/** Redirects non-admins home (W1.4). Server enforces the real gate. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useSession();
  if (loading) return <FullPageLoader />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Role-aware landing: admins → /admin, instructors → /profile. */
export function HomeRedirect() {
  const { isAdmin, loading } = useSession();
  if (loading) return <FullPageLoader />;
  return <Navigate to={isAdmin ? '/admin' : '/profile'} replace />;
}
