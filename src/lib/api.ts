import { env } from './env';
import { getSessionSnapshot, supabase } from './supabase';

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

export class AccountSwitchedError extends Error {
  constructor() {
    super('Signed-in account changed since this page was loaded');
    this.name = 'AccountSwitchedError';
  }
}

let boundAccount: string | null | undefined;

export function bindRequestsToAccount(userId: string | null | undefined) {
  boundAccount = userId;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send `body` (a string) as-is with this Content-Type instead of JSON. */
  contentType?: string;
  /** Return the response body as text instead of parsing JSON. */
  responseType?: 'json' | 'text' | 'blob';
  /** Skip attaching the bearer token (public/health calls). */
  anonymous?: boolean;
  accessToken?: string | null;
  signal?: AbortSignal;
}

/**
 * Single API entry point (W0.3). Attaches the Supabase JWT as
 * `Authorization: Bearer` (only if it belongs to the bound account), sends and
 * receives JSON (or raw text when asked), and normalizes errors. A 401 signs
 * the user out so the route guards bounce them to /login.
 *
 * The NestJS API must allow-list this origin (CORS_ALLOWED_ORIGINS) for these
 * calls to succeed from the browser.
 */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  return (await apiWithHeaders<T>(path, options)).data;
}

export interface ApiResponse<T> {
  data: T;
  headers: Headers;
}

export async function apiWithHeaders<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const {
    method = 'GET',
    body,
    contentType,
    responseType = 'json',
    anonymous = false,
    accessToken,
    signal,
  } = options;

  const headers: Record<string, string> = {
    Accept:
      responseType === 'blob'
        ? '*/*'
        : responseType === 'text'
          ? 'text/plain'
          : 'application/json',
  };
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm)
    headers['Content-Type'] = contentType ?? 'application/json';
  if (!anonymous) {
    const token =
      accessToken === undefined ? await boundAccessToken() : accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : contentType || isForm
          ? (body as BodyInit)
          : JSON.stringify(body),
    signal,
  });

  if (res.status === 401) {
    await supabase.auth.signOut();
    throw new ApiError(401, 'Session expired — please sign in again.');
  }
  if (res.status === 403) await refreshSessionQuietly();

  if (responseType === 'blob' && res.ok)
    return { data: (await res.blob()) as T, headers: res.headers };
  const text = await res.text();
  if (responseType === 'text' && res.ok)
    return { data: text as T, headers: res.headers };
  const data = text ? parseBody(text, responseType) : undefined;

  if (!res.ok) {
    const message =
      (data as { message?: string | string[] })?.message?.toString() ??
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }

  return { data: data as T, headers: res.headers };
}

async function boundAccessToken(): Promise<string | null> {
  const session = await getSessionSnapshot();
  if (boundAccount !== undefined && session.userId !== boundAccount)
    throw new AccountSwitchedError();
  return session.accessToken;
}

async function refreshSessionQuietly(): Promise<void> {
  try {
    await supabase.auth.refreshSession();
  } catch {
    return;
  }
}

function parseBody(
  text: string,
  responseType: RequestOptions['responseType'],
): unknown {
  if (responseType === 'json') return JSON.parse(text);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
