import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { InsuranceRequest, MyInsurance, SubmitRequestBody } from './types';
import { track } from '@/lib/analytics';

export const MY_INSURANCE_KEY = ['me', 'insurance'] as const;

export function useMyInsurance() {
  return useQuery({
    queryKey: MY_INSURANCE_KEY,
    queryFn: () => api<MyInsurance>('/me/insurance'),
  });
}

export function useSubmitRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitRequestBody) =>
      api<InsuranceRequest>('/me/insurance/requests', {
        method: 'POST',
        body,
      }),
    onSuccess: (request) => {
      track('insurance_request_submitted', {
        lessons: request.lessonCount,
      });
      return qc.invalidateQueries({ queryKey: MY_INSURANCE_KEY });
    },
  });
}

export function errorCodeOf(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : null;
}

export interface LessonStudentIndex {
  lessonIndex: number;
  studentIndex?: number;
}

export function errorIndexesOf(error: unknown): LessonStudentIndex[] {
  if (!(error instanceof ApiError) || !error.body) return [];
  const body = error.body as Record<string, unknown>;
  if (typeof body.lessonIndex === 'number')
    return [{ lessonIndex: body.lessonIndex }];
  for (const value of Object.values(body))
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (v) => v && typeof (v as LessonStudentIndex).lessonIndex === 'number',
      )
    )
      return value as LessonStudentIndex[];
  return [];
}
