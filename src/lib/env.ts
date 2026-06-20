/**
 * Typed access to the Vite environment (W0.1). Fails loudly in dev if a
 * required var is missing so misconfiguration surfaces immediately.
 */
interface PortalEnv {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    console.warn(`[env] Missing ${name} — set it in .env (see .env.example).`);
    return '';
  }
  return value;
}

export const env: PortalEnv = {
  apiBaseUrl: required(import.meta.env.VITE_API_BASE_URL, 'VITE_API_BASE_URL'),
  supabaseUrl: required(import.meta.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
  supabasePublishableKey: required(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ),
};
