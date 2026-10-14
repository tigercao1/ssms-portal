import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { signOut, refreshSession, getAccessToken } = vi.hoisted(() => ({
  signOut: vi.fn(),
  refreshSession: vi.fn(),
  getAccessToken: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut, refreshSession } },
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
    refreshSession.mockReset();
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

  it('refreshes the session once on 403 and still throws', async () => {
    refreshSession.mockResolvedValue({ data: {}, error: null });
    mockFetch(403, { message: 'Admin role required' });
    await expect(api('/admin/thing')).rejects.toMatchObject({
      status: 403,
      message: 'Admin role required',
    });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('refreshes on 403 from apiWithHeaders too', async () => {
    refreshSession.mockResolvedValue({ data: {}, error: null });
    mockFetch(403, { message: 'Admin role required' });
    await expect(apiWithHeaders('/admin/things')).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('still throws the 403 when the refresh fails', async () => {
    refreshSession.mockRejectedValue(new Error('network down'));
    mockFetch(403, { message: 'Admin role required' });
    await expect(api('/admin/thing')).rejects.toMatchObject({
      status: 403,
      message: 'Admin role required',
    });
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('still throws the 403 when the refresh returns an error', async () => {
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error('refresh token revoked'),
    });
    mockFetch(403, { message: 'Admin role required' });
    await expect(api('/admin/thing')).rejects.toMatchObject({ status: 403 });
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not refresh the session on 200, 401 or 500', async () => {
    mockFetch(200, { ok: true });
    await api('/thing');
    mockFetch(500, { message: 'boom' });
    await expect(api('/thing')).rejects.toMatchObject({ status: 500 });
    mockFetch(401, { message: 'nope' });
    await expect(api('/thing')).rejects.toMatchObject({ status: 401 });
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
