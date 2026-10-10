// Tests for the docs Worker fetch handler against an in-memory R2 bucket.
import { beforeEach, describe, expect, it } from 'vitest';
import worker, { MAX_OBJECT_BYTES, type Env } from '../src/index';

const TOKEN = 'test-internal-token-0123456789abcdef';
const ORIGIN = 'https://docs.ssnow.club';
const PAGE_HTML = '<!doctype html><title>Lessons</title><h1>Lessons</h1>';
const CSP =
  "script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

interface StoredObject {
  bytes: Uint8Array;
  contentType: string | undefined;
}

class MemoryBucket {
  readonly objects = new Map<string, StoredObject>();

  async get(key: string) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      key,
      size: stored.bytes.byteLength,
      httpMetadata: { contentType: stored.contentType },
      body: new Response(stored.bytes).body,
    };
  }

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ) {
    const bytes =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : new Uint8Array(value);
    this.objects.set(key, {
      bytes,
      contentType: options?.httpMetadata?.contentType,
    });
    return { key, size: bytes.byteLength };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

let bucket: MemoryBucket;
let env: Env;

beforeEach(() => {
  bucket = new MemoryBucket();
  env = { DOCS: bucket as unknown as R2Bucket, DOCS_INTERNAL_TOKEN: TOKEN };
});

function call(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`${ORIGIN}${path}`, init), env);
}

function internal(
  key: string,
  init: RequestInit = {},
  token: string | null = TOKEN,
) {
  const headers = new Headers(init.headers);
  if (token !== null) headers.set('Authorization', `Bearer ${token}`);
  return call(`/_internal/objects/${key}`, { ...init, headers });
}

function seed(key: string, html: string) {
  bucket.objects.set(key, {
    bytes: new TextEncoder().encode(html),
    contentType: 'text/html; charset=utf-8',
  });
}

function expectSecurityHeaders(response: Response) {
  expect(response.headers.get('Content-Security-Policy')).toBe(CSP);
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Referrer-Policy')).toBe(
    'strict-origin-when-cross-origin',
  );
}

describe('public pages', () => {
  it('serves a published page with every required header', async () => {
    seed('published/winter-lessons.html', PAGE_HTML);

    const response = await call('/winter-lessons');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/html; charset=utf-8',
    );
    expectSecurityHeaders(response);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(response.headers.has('X-Robots-Tag')).toBe(false);
    expect(await response.text()).toBe(PAGE_HTML);
  });

  it('answers HEAD with the page headers and no body', async () => {
    seed('published/winter-lessons.html', PAGE_HTML);

    const response = await call('/winter-lessons', { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/html; charset=utf-8',
    );
    expectSecurityHeaders(response);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await response.text()).toBe('');
  });

  it('does not serve drafts publicly', async () => {
    seed('drafts/winter-lessons.html', PAGE_HTML);

    const response = await call('/winter-lessons');

    expect(response.status).toBe(404);
  });

  it('returns a 404 page with the security headers for a missing page', async () => {
    const response = await call('/no-such-page');

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe(
      'text/html; charset=utf-8',
    );
    expectSecurityHeaders(response);
    expect(await response.text()).toContain('Page not found');
  });

  it('returns 404 with no body for HEAD on a missing page', async () => {
    const response = await call('/no-such-page', { method: 'HEAD' });

    expect(response.status).toBe(404);
    expectSecurityHeaders(response);
    expect(await response.text()).toBe('');
  });

  it.each([
    '/Upper-Case',
    '/double--dash',
    '/-leading',
    '/trailing-',
    '/under_score',
    '/page.html',
    '/a/b',
    `/${'a'.repeat(81)}`,
    '/%61bc',
  ])('returns 404 for invalid slug %s', async (path) => {
    seed('published/a.html', PAGE_HTML);

    const response = await call(path);

    expect(response.status).toBe(404);
    expectSecurityHeaders(response);
  });

  it('serves an 80-character slug', async () => {
    const slug = 'a'.repeat(80);
    seed(`published/${slug}.html`, PAGE_HTML);

    expect((await call(`/${slug}`)).status).toBe(200);
  });

  it('redirects / to the main site', async () => {
    const response = await call('/', { redirect: 'manual' });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://ssnow.club/');
  });

  it('redirects a trailing slash to the bare slug', async () => {
    const response = await call('/winter-lessons/');

    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('/winter-lessons');
  });

  it('returns 404 for a trailing slash on an invalid slug', async () => {
    expect((await call('/Not_Valid/')).status).toBe(404);
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])(
    'rejects %s on a public path with 405',
    async (method) => {
      seed('published/winter-lessons.html', PAGE_HTML);

      const response = await call('/winter-lessons', { method });

      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, HEAD');
      expectSecurityHeaders(response);
    },
  );

  it.each([
    ['/', 302],
    ['/winter-lessons/', 301],
  ])('sends the security headers on the %s redirect', async (path, status) => {
    const response = await call(path, { redirect: 'manual' });

    expect(response.status).toBe(status);
    expectSecurityHeaders(response);
  });

  it('rejects POST on / with 405', async () => {
    expect((await call('/', { method: 'POST' })).status).toBe(405);
  });
});

describe('internal object API', () => {
  it('stores an object with an HTML content type', async () => {
    const response = await internal('drafts/winter-lessons.html', {
      method: 'PUT',
      body: PAGE_HTML,
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const stored = bucket.objects.get('drafts/winter-lessons.html');
    expect(stored?.contentType).toBe('text/html; charset=utf-8');
    expect(new TextDecoder().decode(stored?.bytes)).toBe(PAGE_HTML);
  });

  it('accepts a body of exactly 2 MiB', async () => {
    const response = await internal('published/big.html', {
      method: 'PUT',
      body: new Uint8Array(MAX_OBJECT_BYTES),
    });

    expect(response.status).toBe(204);
    expect(bucket.objects.get('published/big.html')?.bytes.byteLength).toBe(
      MAX_OBJECT_BYTES,
    );
  });

  it('rejects a body over 2 MiB with 413', async () => {
    const response = await internal('drafts/big.html', {
      method: 'PUT',
      body: new Uint8Array(MAX_OBJECT_BYTES + 1),
    });

    expect(response.status).toBe(413);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(bucket.objects.has('drafts/big.html')).toBe(false);
  });

  it('rejects an over-limit streamed body without a Content-Length', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 3; i++) controller.enqueue(chunk);
        controller.close();
      },
    });

    const response = await internal('drafts/big.html', {
      method: 'PUT',
      body,
      duplex: 'half',
    } as RequestInit);

    expect(response.status).toBe(413);
    expect(bucket.objects.has('drafts/big.html')).toBe(false);
  });

  it('returns the stored bytes', async () => {
    seed('drafts/winter-lessons.html', PAGE_HTML);

    const response = await internal('drafts/winter-lessons.html');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe(PAGE_HTML);
  });

  it('returns 404 for a missing object', async () => {
    const response = await internal('published/missing.html');

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('deletes an object and is idempotent', async () => {
    seed('published/winter-lessons.html', PAGE_HTML);

    const first = await internal('published/winter-lessons.html', {
      method: 'DELETE',
    });
    const second = await internal('published/winter-lessons.html', {
      method: 'DELETE',
    });

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect(bucket.objects.has('published/winter-lessons.html')).toBe(false);
  });

  it.each([
    ['missing', null],
    ['wrong', 'not-the-token'],
    ['empty', ''],
  ])('returns 401 with no body for a %s token', async (_label, token) => {
    seed('drafts/winter-lessons.html', PAGE_HTML);

    const response = await internal('drafts/winter-lessons.html', {}, token);

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  it('rejects a non-Bearer scheme with 401', async () => {
    const response = await call(
      '/_internal/objects/drafts/winter-lessons.html',
      {
        headers: { Authorization: TOKEN },
      },
    );

    expect(response.status).toBe(401);
  });

  it('rejects every request when the secret is not configured', async () => {
    env = { ...env, DOCS_INTERNAL_TOKEN: '' };

    const response = await internal('drafts/winter-lessons.html', {}, '');

    expect(response.status).toBe(401);
  });

  it('does not write on PUT with a wrong token', async () => {
    const response = await internal(
      'published/winter-lessons.html',
      { method: 'PUT', body: PAGE_HTML },
      'not-the-token',
    );

    expect(response.status).toBe(401);
    expect(bucket.objects.size).toBe(0);
  });

  it.each([
    'other/winter-lessons.html',
    'drafts/winter-lessons.htm',
    'drafts/Winter.html',
    'drafts/a--b.html',
    'drafts/.html',
    'published/a/b.html',
    `drafts/${'a'.repeat(81)}.html`,
    'drafts/%2e%2e.html',
  ])('returns 400 for invalid key %s', async (key) => {
    const response = await internal(key, { method: 'PUT', body: PAGE_HTML });

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(bucket.objects.size).toBe(0);
  });

  it('returns 405 for an unsupported internal method', async () => {
    const response = await internal('drafts/winter-lessons.html', {
      method: 'POST',
      body: 'x',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 404 for an unknown internal path', async () => {
    const response = await call('/_internal/other', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('requires the token on unknown internal paths', async () => {
    expect((await call('/_internal/other')).status).toBe(401);
  });
});
