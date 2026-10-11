// Public docs pages on docs.ssnow.club, served from R2, plus the internal object API used by ssms-api.

export interface Env {
  DOCS: R2Bucket;
  DOCS_INTERNAL_TOKEN: string;
}

export const MAX_OBJECT_BYTES = 2_097_152;

const HOME_URL = 'https://ssnow.club/';
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const INTERNAL_ROOT = '/_internal';
const INTERNAL_OBJECTS_PREFIX = '/_internal/objects/';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 80;
const OBJECT_KEY_PATTERN = /^(?:drafts|published)\/([^/]+)\.html$/;

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Page not found</title></head>
<body><h1>Page not found</h1><p><a href="${HOME_URL}">ssnow.club</a></p></body>
</html>
`;

export function isValidSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

export function isValidObjectKey(key: string): boolean {
  const match = OBJECT_KEY_PATTERN.exec(key);
  return match !== null && isValidSlug(match[1] ?? '');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname, search } = new URL(request.url);
    if (
      pathname === INTERNAL_ROOT ||
      pathname.startsWith(`${INTERNAL_ROOT}/`)
    ) {
      return handleInternal(request, env, pathname);
    }
    return handlePublic(request, env, pathname, search);
  },
};

async function handlePublic(
  request: Request,
  env: Env,
  pathname: string,
  search: string,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {
      status: 405,
      headers: { ...SECURITY_HEADERS, Allow: 'GET, HEAD' },
    });
  }
  if (pathname === '/') {
    return new Response(null, {
      status: 302,
      headers: { ...SECURITY_HEADERS, Location: HOME_URL },
    });
  }

  const segment = pathname.slice(1);
  if (segment.endsWith('/') && isValidSlug(segment.slice(0, -1))) {
    return new Response(null, {
      status: 301,
      headers: {
        ...SECURITY_HEADERS,
        Location: `/${segment.slice(0, -1)}${search}`,
      },
    });
  }
  if (!isValidSlug(segment)) return notFound(request);

  const object = await env.DOCS.get(`published/${segment}.html`);
  if (object === null) return notFound(request);

  const params = new URLSearchParams(search);
  const body =
    request.method === 'HEAD'
      ? null
      : [...params.keys()].length === 0
        ? object.body
        : applyQueryState(await new Response(object.body).text(), params);

  return new Response(body, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': HTML_CONTENT_TYPE,
      'Cache-Control': 'public, max-age=60',
    },
  });
}

const QUERY_INPUT = /<input\b[^>]*\bdata-query="([^"=&]+)=([^"&]*)"[^>]*>/gi;
const CHECKED_ATTR = /\s+checked(?:="[^"]*")?(?=[\s/>])/i;

export function applyQueryState(html: string, params: URLSearchParams): string {
  return html.replace(QUERY_INPUT, (tag, key: string, value: string) => {
    if (!params.has(key)) return tag;
    const unchecked = tag.replace(CHECKED_ATTR, '');
    return params.get(key) === value
      ? unchecked.replace(/^<input\b/i, '<input checked')
      : unchecked;
  });
}

function notFound(request: Request): Response {
  return new Response(request.method === 'HEAD' ? null : NOT_FOUND_HTML, {
    status: 404,
    headers: { ...SECURITY_HEADERS, 'Content-Type': HTML_CONTENT_TYPE },
  });
}

async function handleInternal(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  if (!(await isAuthorized(request, env.DOCS_INTERNAL_TOKEN)))
    return internalResponse(null, 401);
  if (!pathname.startsWith(INTERNAL_OBJECTS_PREFIX))
    return internalResponse(null, 404);

  const key = pathname.slice(INTERNAL_OBJECTS_PREFIX.length);
  if (!isValidObjectKey(key)) return internalResponse(null, 400);

  switch (request.method) {
    case 'PUT':
      return putObject(request, env, key);
    case 'GET':
      return getObject(env, key);
    case 'DELETE':
      await env.DOCS.delete(key);
      return internalResponse(null, 204);
    default:
      return internalResponse(null, 405, { Allow: 'GET, PUT, DELETE' });
  }
}

async function putObject(
  request: Request,
  env: Env,
  key: string,
): Promise<Response> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (declaredLength > MAX_OBJECT_BYTES) return internalResponse(null, 413);

  const body = await readBodyWithinLimit(request, MAX_OBJECT_BYTES);
  if (body === null) return internalResponse(null, 413);

  await env.DOCS.put(key, body, {
    httpMetadata: { contentType: HTML_CONTENT_TYPE },
  });
  return internalResponse(null, 204);
}

async function getObject(env: Env, key: string): Promise<Response> {
  const object = await env.DOCS.get(key);
  if (object === null) return internalResponse(null, 404);
  return internalResponse(object.body, 200, {
    ...SECURITY_HEADERS,
    'Content-Type': object.httpMetadata?.contentType ?? HTML_CONTENT_TYPE,
  });
}

function internalResponse(
  body: BodyInit | null,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { ...headers, 'Cache-Control': 'no-store' },
  });
}

async function readBodyWithinLimit(
  request: Request,
  limit: number,
): Promise<Uint8Array | null> {
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function isAuthorized(
  request: Request,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const provided = request.headers.get('Authorization') ?? '';
  const [providedDigest, expectedDigest] = await Promise.all([
    sha256(provided),
    sha256(`Bearer ${token}`),
  ]);
  let difference = 0;
  for (let i = 0; i < expectedDigest.length; i++) {
    difference |= (providedDigest[i] ?? 0) ^ (expectedDigest[i] ?? 0);
  }
  return difference === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}
