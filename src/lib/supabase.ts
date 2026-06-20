import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Browser Supabase client (W0.3). Owns the auth session (ES256 JWT). Uses the
 * publishable key — safe for the browser. All DATA access goes through the
 * NestJS API; this client is used only for auth + the photo-storage upload.
 */
export const supabase = createClient(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

/** Current access token (JWT) for attaching to API calls, or null. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
