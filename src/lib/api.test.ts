import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { signOut, getAccessToken } = vi.hoisted(() => ({
  signOut: vi.fn(),
  getAccessToken: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut } },
  getAccessToken,
}));

import { api, ApiError } from './api';

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
});
