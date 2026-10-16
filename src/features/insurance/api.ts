import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type {
  CapReached,
  InsuranceRecord,
  MyInsurance,
  RegisterLessonBody,
  SeasonPassBody,
} from './types';

export const MY_INSURANCE_KEY = ['me', 'insurance'] as const;

export function useMyInsurance() {
  return useQuery({
    queryKey: MY_INSURANCE_KEY,
    queryFn: () => api<MyInsurance>('/me/insurance'),
  });
}

export function useSeasonInsurance(season: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...MY_INSURANCE_KEY, { season }],
    queryFn: () =>
      api<MyInsurance>(
        `/me/insurance?season=${encodeURIComponent(season ?? '')}`,
      ),
    enabled: enabled && Boolean(season),
  });
}

function useInvalidateMyInsurance() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: MY_INSURANCE_KEY });
}

export function useRegisterLesson() {
  const invalidate = useInvalidateMyInsurance();
  return useMutation({
    mutationFn: (body: RegisterLessonBody) =>
      api<InsuranceRecord>('/me/insurance/records', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useBuySeasonPass() {
  const invalidate = useInvalidateMyInsurance();
  return useMutation({
    mutationFn: (body: SeasonPassBody) =>
      api<InsuranceRecord>('/me/insurance/season-pass', {
        method: 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

export function capReachedOf(error: unknown): CapReached | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.body as Partial<CapReached> | undefined;
  return body?.code === 'cap_reached' &&
    typeof body.topUpCents === 'number' &&
    typeof body.listCents === 'number' &&
    typeof body.owedCents === 'number'
    ? (body as CapReached)
    : null;
}

export function errorCodeOf(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : null;
}
