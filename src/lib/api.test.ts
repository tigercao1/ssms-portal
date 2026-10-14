import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { signOut, getAccessToken } = vi.hoisted(() => ({
  signOut: vi.fn(),
  getAccessToken: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut } },
  getAccessToken,
}));

import { api, ApiError, apiWithHeaders } from './api';

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(body === undefined ? '' : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

describe('api client', () => {
  beforeEach(() => {
    getAccessToken.mockResolvedValue('tok-123');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    signOut.mockClear();
  });

  it('returns parsed JSON on 200 and attaches the bearer token', async () => {
    mockFetch(200, { ok: true });
    const result = await api<{ ok: boolean }>('/thing');
    expect(result).toEqual({ ok: true });
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-123');
  });

  it('can also return the response headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([1, 2]), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Total-Count': '7' },
        }),
      ),
    );
    const { data, headers } = await apiWithHeaders<number[]>('/things');
    expect(data).toEqual([1, 2]);
    expect(headers.get('X-Total-Count')).toBe('7');
  });

  it('signs out and throws on 401', async () => {
    mockFetch(401, { message: 'nope' });
    await expect(api('/secure')).rejects.toBeInstanceOf(ApiError);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('normalizes a 4xx error message', async () => {
    mockFetch(409, { message: 'duplicate key' });
    await expect(api('/ref')).rejects.toMatchObject({
      status: 409,
      message: 'duplicate key',
    });
  });

  it('sends a raw body with the given content type', async () => {
    mockFetch(200, { id: 'p1' });
    await api('/admin/pages/p1/content', {
      method: 'PUT',
      body: '<h1>Hi</h1>',
      contentType: 'text/html',
    });
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const init = call[1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('<h1>Hi</h1>');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'text/html',
    );
  });

  it('returns text responses unparsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<h1>{"not": json}</h1>', {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
      ),
    );
    await expect(api('/page', { responseType: 'text' })).resolves.toBe(
      '<h1>{"not": json}</h1>',
    );
  });

  it('normalizes errors on text requests, JSON or not', async () => {
    mockFetch(404, { message: 'No content' });
    await expect(api('/page', { responseType: 'text' })).rejects.toMatchObject({
      status: 404,
      message: 'No content',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })),
    );
    await expect(api('/page', { responseType: 'text' })).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    });
  });
});
