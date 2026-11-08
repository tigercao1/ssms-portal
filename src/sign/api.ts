export type SignLang = 'en' | 'zh';

export type SignFieldType = 'text' | 'email' | 'date' | 'signature';

export interface SignField {
  key: string;
  type: SignFieldType;
  label: string;
  required: boolean;
}

export interface SignForm {
  slug: string;
  lang: SignLang;
  version: number;
  title: string;
  bodyMarkdown: string;
  fields: SignField[];
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
  ) {
    super(`Sign API request failed with ${status}`);
    this.name = 'SignApiError';
  }
}

const KIND_BY_STATUS: Record<number, SignErrorKind> = {
  404: 'not_found',
  409: 'stale',
  422: 'invalid',
  429: 'throttled',
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';

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
    throw new SignApiError(KIND_BY_STATUS[res.status] ?? 'failed', res.status);
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
