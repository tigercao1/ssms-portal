export type SignLang = 'en' | 'zh';

export type SignFieldType = 'text' | 'email' | 'date' | 'signature';

export interface SignField {
  key: string;
  type: SignFieldType;
  label: string;
  required: boolean;
}

export interface SignPlacement {
  key: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SignOriginalPdf {
  pageCount: number;
  pages: { width: number; height: number }[];
  placements: SignPlacement[];
}

export interface SignForm {
  slug: string;
  lang: SignLang;
  version: number;
  title: string;
  bodyMarkdown: string;
  fields: SignField[];
  hasOriginalPdf?: boolean;
  originalPdf?: SignOriginalPdf | null;
}

export interface SignOriginalPdfUrl {
  url: string;
  expiresAt: string;
}

export interface SignCompletion {
  lang: SignLang;
  version: number;
  answers: Record<string, string>;
  signatures: Record<string, string>;
  consent: true;
}

export interface SignCompletionResult {
  status: 'signed';
  emailed: boolean;
}

export type SignErrorKind =
  | 'not_found'
  | 'stale'
  | 'invalid'
  | 'throttled'
  | 'failed';

export class SignApiError extends Error {
  constructor(
    readonly kind: SignErrorKind,
    readonly status: number,
    readonly reasons: string[] = [],
  ) {
    super(`Sign API request failed with ${status}`);
    this.name = 'SignApiError';
  }
}

const KIND_BY_STATUS: Record<number, SignErrorKind> = {
  400: 'invalid',
  404: 'not_found',
  409: 'stale',
  422: 'invalid',
  429: 'throttled',
};

async function errorReasons(res: Response): Promise<string[]> {
  try {
    const { message } = (await res.json()) as { message?: unknown };
    const messages = Array.isArray(message) ? message : [message];
    return messages.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
  } catch {
    return [];
  }
}

const apiBase = import.meta.env.VITE_SIGN_API_BASE_URL ?? '';

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, {
      ...init,
      credentials: 'omit',
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new SignApiError('failed', 0);
  }
  if (!res.ok)
    throw new SignApiError(
      KIND_BY_STATUS[res.status] ?? 'failed',
      res.status,
      await errorReasons(res),
    );
  return (await res.json()) as T;
}

export function fetchSignForm(
  slug: string,
  lang: SignLang,
  signal?: AbortSignal,
): Promise<SignForm> {
  return request<SignForm>(
    `/sign/forms/${encodeURIComponent(slug)}?lang=${lang}`,
    { method: 'GET', signal },
  );
}

function originalPath(slug: string, lang: SignLang) {
  return `/sign/forms/${encodeURIComponent(slug)}/original?lang=${lang}`;
}

export function originalPdfHref(slug: string, lang: SignLang): string {
  return `${apiBase}${originalPath(slug, lang)}`;
}

export function fetchOriginalPdfUrl(
  slug: string,
  lang: SignLang,
  signal?: AbortSignal,
): Promise<SignOriginalPdfUrl> {
  return request<SignOriginalPdfUrl>(
    `${originalPath(slug, lang)}&format=json`,
    {
      method: 'GET',
      signal,
    },
  );
}

export async function fetchPdfBytes(
  url: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'omit', signal });
  } catch {
    throw new SignApiError('failed', 0);
  }
  if (!res.ok) throw new SignApiError('failed', res.status);
  return new Uint8Array(await res.arrayBuffer());
}

export function completeSignForm(
  slug: string,
  body: SignCompletion,
): Promise<SignCompletionResult> {
  return request<SignCompletionResult>(
    `/sign/forms/${encodeURIComponent(slug)}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}
