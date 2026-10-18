import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';

const ORIGIN = 'https://portal.example.com';

const upstreamCalls: Request[] = [];
const cacheStore = new Map<string, Response>();
const pending: Promise<unknown>[] = [];

const ctx = {
  waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

const env: Env = {
  ASSETS: {
    fetch: async () => new Response('<!doctype html>', { status: 200 }),
  } as unknown as Fetcher,
};

function call(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(
    new Request(`${ORIGIN}${path}`, init) as Parameters<typeof worker.fetch>[0],
    env,
    ctx,
  );
}

beforeEach(() => {
  upstreamCalls.length = 0;
  cacheStore.clear();
  pending.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      upstreamCalls.push(new Request(input, init));
      return new Response('upstream', { status: 200 });
    }),
  );
  vi.stubGlobal('caches', {
    default: {
      match: async (request: Request) => cacheStore.get(request.url)?.clone(),
      put: async (request: Request, response: Response) => {
        cacheStore.set(request.url, response);
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PostHog proxy', () => {
  it('forwards events to the PostHog API without cookies or auth, keeping the client IP', async () => {
    const body = JSON.stringify({ event: '$pageview' });
    const response = await call('/snr/i/v0/e/?compression=gzip-js&ver=1', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'text/plain',
        cookie: 'sb-session=secret',
        authorization: 'Bearer secret',
        'CF-Connecting-IP': '203.0.113.7',
      },
    });

    expect(response.status).toBe(200);
    expect(upstreamCalls).toHaveLength(1);
    const sent = upstreamCalls[0]!;
    expect(sent.url).toBe(
      'https://us.i.posthog.com/i/v0/e/?compression=gzip-js&ver=1',
    );
    expect(sent.method).toBe('POST');
    expect(await sent.text()).toBe(body);
    expect(sent.headers.get('content-type')).toBe('text/plain');
    expect(sent.headers.get('cookie')).toBeNull();
    expect(sent.headers.get('authorization')).toBeNull();
    expect(sent.headers.get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('serves the SDK, recorder and remote config from the PostHog asset host', async () => {
    await call('/snr/static/1.438.12/lazy-recorder.js?v=1');
    await call('/snr/array/phc_test/config.js');

    expect(upstreamCalls.map((r) => r.url)).toEqual([
      'https://us-assets.i.posthog.com/static/1.438.12/lazy-recorder.js?v=1',
      'https://us-assets.i.posthog.com/array/phc_test/config.js',
    ]);
  });

  it('answers repeat asset requests from the cache', async () => {
    await call('/snr/static/surveys.js');
    await Promise.all(pending);
    const second = await call('/snr/static/surveys.js');

    expect(await second.text()).toBe('upstream');
    expect(upstreamCalls).toHaveLength(1);
  });

  it('never leaves the PostHog host, even for a protocol-relative path', async () => {
    await call('/snr//evil.example.com/steal');

    expect(new URL(upstreamCalls[0]!.url).host).toBe('us.i.posthog.com');
  });

  it('serves every other path from the static assets', async () => {
    const response = await call('/admin/instructors');

    expect(await response.text()).toBe('<!doctype html>');
    expect(upstreamCalls).toHaveLength(0);
  });
});
