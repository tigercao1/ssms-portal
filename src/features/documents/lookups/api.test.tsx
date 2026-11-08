import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { SessionProvider } from '@/auth/SessionProvider';
import { queryClient } from '@/lib/query';
import { server } from '@/test/msw';
import { fakeSession, resetAuth, setSession } from '@/test/supabaseAuth';
import {
  SEARCH_QUERY_MAX,
  useMyStudentSignatures,
  useSignatureLookup,
} from './api';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));
vi.mock('@/lib/analytics', () => ({
  identifyUser: vi.fn(),
  resetUser: vi.fn(),
  track: vi.fn(),
}));

const API = 'http://localhost:3000';

function sessionFor(id: 'a' | 'b'): Session {
  const base = fakeSession(`${id}@example.com`);
  return {
    ...base,
    access_token: `jwt-${id}`,
    user: { ...base.user, id: `auth-${id}` },
  };
}

let requests: string[];

function ownerOf(request: Request) {
  return request.headers.get('Authorization') === 'Bearer jwt-a' ? 'A' : 'B';
}

beforeEach(() => {
  resetAuth();
  requests = [];
  server.use(
    http.get(`${API}/me/students/signatures`, ({ request }) => {
      const owner = ownerOf(request);
      requests.push(`students:${owner}`);
      return HttpResponse.json([
        { name: `Student of ${owner}`, signed: true, signedAt: null },
      ]);
    }),
    http.get(`${API}/admin/signatures`, ({ request }) => {
      const owner = ownerOf(request);
      requests.push(`signatures:${owner}`);
      return HttpResponse.json([
        {
          subjectType: 'customer',
          subjectId: owner,
          name: `Signer for ${owner}`,
          email: null,
          signatures: [],
        },
      ]);
    }),
  );
});

afterEach(() => {
  queryClient.clear();
});

function Students({ q = '' }: { q?: string }) {
  const { data } = useMyStudentSignatures(q);
  return <p>{data?.map((s) => s.name).join(',') ?? 'none'}</p>;
}

function Signers({ q = 'ja' }: { q?: string }) {
  const { data } = useSignatureLookup(q);
  return <p>{data?.map((s) => s.name).join(',') ?? 'none'}</p>;
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

async function signIn(id: 'a' | 'b') {
  await act(async () => setSession(sessionFor(id)));
}

describe.each([
  ['students', Students, 'Student of'],
  ['signatures', Signers, 'Signer for'],
] as const)('%s cache across accounts', (kind, Lookup, label) => {
  it('does not show A’s data to B after a sign-out and sign-in', async () => {
    await signIn('a');
    const first = render(<Lookup />, { wrapper: Providers });
    expect(await screen.findByText(`${label} A`)).toBeVisible();
    first.unmount();

    await act(async () => setSession(null));
    await signIn('b');
    render(<Lookup />, { wrapper: Providers });

    expect(screen.queryByText(`${label} A`)).toBeNull();
    expect(await screen.findByText(`${label} B`)).toBeVisible();
    expect(requests).toEqual([`${kind}:A`, `${kind}:B`]);
  });

  it('does not keep A’s data as a placeholder when the account changes in place', async () => {
    await signIn('a');
    render(<Lookup />, { wrapper: Providers });
    expect(await screen.findByText(`${label} A`)).toBeVisible();

    await signIn('b');

    expect(screen.queryByText(`${label} A`)).toBeNull();
    expect(await screen.findByText(`${label} B`)).toBeVisible();
    expect(requests).toEqual([`${kind}:A`, `${kind}:B`]);
  });

  it('does not send a query longer than the API maximum', async () => {
    await signIn('a');
    render(<Lookup q={'x'.repeat(SEARCH_QUERY_MAX + 1)} />, {
      wrapper: Providers,
    });
    await act(async () => {});
    await waitFor(() => expect(screen.getByText('none')).toBeVisible());
    expect(requests).toEqual([]);
  });
});
