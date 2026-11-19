import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { fakeClass, server } from '@/test/msw';
import { useCancelBooking, useUpdateBooking } from './bookingApi';

const API = 'http://localhost:3000';
const periodKey = ['admin', 'payroll', 'period', 'p1'];

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(periodKey, { period: { id: 'p1' } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe('booking mutations', () => {
  it('marks cached payroll stale after a lesson is cancelled', async () => {
    server.use(
      http.post(`${API}/admin/booking/classes/:id/cancel`, () =>
        HttpResponse.json(fakeClass({ id: 'c1', status: 'cancelled' })),
      ),
    );
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useCancelBooking(), { wrapper });

    await act(() => result.current.mutateAsync({ id: 'c1', sendEmails: true }));

    expect(qc.getQueryState(periodKey)?.isInvalidated).toBe(true);
  });

  it('sends sendEmails false on cancel only when emails are turned off', async () => {
    const bodies: string[] = [];
    server.use(
      http.post(
        `${API}/admin/booking/classes/:id/cancel`,
        async ({ request }) => {
          bodies.push(await request.text());
          return HttpResponse.json(
            fakeClass({ id: 'c1', status: 'cancelled' }),
          );
        },
      ),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useCancelBooking(), { wrapper });

    await act(() => result.current.mutateAsync({ id: 'c1', sendEmails: true }));
    await act(() =>
      result.current.mutateAsync({ id: 'c1', sendEmails: false }),
    );

    expect(bodies).toEqual(['', JSON.stringify({ sendEmails: false })]);
  });

  it('marks cached payroll stale after a lesson is moved', async () => {
    server.use(
      http.patch(`${API}/admin/booking/classes/:id`, () =>
        HttpResponse.json(fakeClass({ id: 'c1' })),
      ),
    );
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useUpdateBooking(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        id: 'c1',
        startsAt: '2026-12-06T15:00:00.000Z',
      }),
    );

    expect(qc.getQueryState(periodKey)?.isInvalidated).toBe(true);
  });
});
