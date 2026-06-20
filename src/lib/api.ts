import { env } from './env';
import { getAccessToken, supabase } from './supabase';

/** Normalized API error thrown by {@link api}. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip attaching the bearer token (public/health calls). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/**
 * Single API entry point (W0.3). Attaches the Supabase JWT as
 * `Authorization: Bearer`, sends/receives JSON, and normalizes errors. A 401
 * signs the user out so the route guards bounce them to /login.
 *
 * The NestJS API must allow-list this origin (CORS_ALLOWED_ORIGINS) for these
 * calls to succeed from the browser.
 */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, anonymous = false, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!anonymous) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 401) {
    await supabase.auth.signOut();
    throw new ApiError(401, 'Session expired — please sign in again.');
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    const message =
      (data as { message?: string | string[] })?.message?.toString() ??
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}
