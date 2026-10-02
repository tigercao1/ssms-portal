import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import {
  useAddReference,
  useAdminReferences,
  useDeleteReference,
  useReferenceUsage,
  useUpdateReference,
} from './api';

const API = 'http://localhost:3000';
const record = { id: 'r1', key: 'k', name: 'n', sortOrder: 0, isActive: false };

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

function invalidatedKeys(invalidate: ReturnType<typeof setup>['invalidate']) {
  return invalidate.mock.calls.map(([filters]) => filters?.queryKey);
}

describe('admin reference hooks', () => {
  it('PATCHes the row and refreshes the admin and public lists', async () => {
    let body: unknown;
    server.use(
      http.patch(`${API}/admin/reference/languages/r1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(record);
      }),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUpdateReference('languages'), {
      wrapper,
    });

    await act(() => result.current.mutateAsync({ id: 'r1', isActive: false }));

    expect(body).toEqual({ isActive: false });
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([
          ['admin', 'reference', 'languages'],
          ['reference', 'languages'],
        ]),
      ),
    );
  });

  it('DELETEs the row and refreshes the admin and public lists', async () => {
    let method: string | undefined;
    server.use(
      http.delete(`${API}/admin/reference/languages/r1`, ({ request }) => {
        method = request.method;
        return HttpResponse.json({ ...record, removedLinkCount: 2 });
      }),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteReference('languages'), {
      wrapper,
    });

    await act(() => result.current.mutateAsync('r1'));

    expect(method).toBe('DELETE');
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([
          ['admin', 'reference', 'languages'],
          ['reference', 'languages'],
        ]),
      ),
    );
  });

  it('lists every row from the admin endpoint, including inactive ones', async () => {
    server.use(
      http.get(`${API}/admin/reference/languages`, () =>
        HttpResponse.json([record]),
      ),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useAdminReferences('languages'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual([record]));
  });

  it('fetches usage only once a row is chosen', async () => {
    let hits = 0;
    server.use(
      http.get(`${API}/admin/reference/languages/r1/usage`, () => {
        hits += 1;
        return HttpResponse.json({ instructorCount: 4 });
      }),
    );
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useReferenceUsage('languages', id),
      { wrapper, initialProps: { id: null as string | null } },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(hits).toBe(0);
    rerender({ id: 'r1' });
    await waitFor(() =>
      expect(result.current.data).toEqual({ instructorCount: 4 }),
    );
  });

  it('adding a row refreshes the admin and public lists', async () => {
    server.use(
      http.post(`${API}/admin/reference/languages`, () =>
        HttpResponse.json(record),
      ),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useAddReference('languages'), {
      wrapper,
    });

    await act(() => result.current.mutateAsync({ key: 'k', name: 'n' }));

    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([
          ['admin', 'reference', 'languages'],
          ['reference', 'languages'],
        ]),
      ),
    );
  });
});
