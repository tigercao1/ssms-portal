import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeRedirect } from '@/app/router/guards';
import { useT } from '@/i18n/core/I18nProvider';
import { Spinner } from '@/components';
import { AuthLayout } from './AuthLayout';
import { useSession } from './SessionProvider';

function urlHasAuthError(): boolean {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return Boolean(
    hash.get('error') ||
    hash.get('error_code') ||
    query.get('error') ||
    query.get('error_code'),
  );
}

/**
 * Magic-link landing (`/auth/callback`). The Supabase client reads the session
 * from the URL hash while it initialises; once the session provider settles we
 * either send the user home or explain that the link did not work.
 */
export function AuthCallbackPage() {
  const t = useT();
  const { session, loading } = useSession();
  const [linkFailed] = useState(urlHasAuthError);

  if (!linkFailed && loading)
    return (
      <AuthLayout>
        <h2 className="text-3xl">{t.authCallback.signingIn}</h2>
        <div className="mt-8 flex justify-center">
          <Spinner className="h-7 w-7" />
        </div>
      </AuthLayout>
    );

  if (!linkFailed && session) return <HomeRedirect />;

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.authCallback.errorTitle}</h2>
      <p className="mt-2 text-slate">{t.authCallback.errorBody}</p>
      <Link
        to="/login"
        className="mt-8 inline-block text-sm text-navy hover:underline"
      >
        {t.auth.backToSignIn}
      </Link>
    </AuthLayout>
  );
}
