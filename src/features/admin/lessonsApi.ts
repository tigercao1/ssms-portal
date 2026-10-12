import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AdminClass,
  InstructorCalendarsOverview,
  InstructorGoogleCalendar,
  InstructorGoogleCalendarInput,
  LessonType,
  LessonTypeInput,
  PayRate,
  PayRateCreate,
  PayRatePatch,
  SuggestCalendarsResult,
} from '@/lib/types';

const lessonTypesKey = ['admin', 'lesson-types'] as const;
const payRatesKey = ['admin', 'pay-rates'] as const;
const instructorCalendarsKey = ['admin', 'instructor-calendars'] as const;
const googleCalendarKey = (instructorId: string) =>
  ['admin', 'instructor', instructorId, 'google-calendar'] as const;

export interface ClassFilter {
  from: string;
  to: string;
  instructorId?: string;
}

export function useLessonTypes() {
  return useQuery({
    queryKey: lessonTypesKey,
    queryFn: () => api<LessonType[]>('/admin/lesson-types'),
  });
}

export function useCreateLessonType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LessonTypeInput) =>
      api<LessonType>('/admin/lesson-types', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: lessonTypesKey }),
  });
}

export function useUpdateLessonType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: LessonTypeInput & { id: string }) =>
      api<LessonType>(`/admin/lesson-types/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: lessonTypesKey }),
  });
}

export function usePayRates() {
  return useQuery({
    queryKey: payRatesKey,
    queryFn: () => api<PayRate[]>('/admin/pay-rates'),
  });
}

export function useCreatePayRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PayRateCreate) =>
      api<PayRate>('/admin/pay-rates', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: payRatesKey }),
  });
}

export function useUpdatePayRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: PayRatePatch & { id: string }) =>
      api<PayRate>(`/admin/pay-rates/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: payRatesKey }),
  });
}

export function useAdminClasses(filter: ClassFilter | null) {
  return useQuery({
    queryKey: ['admin', 'classes', filter] as const,
    enabled: filter !== null,
    queryFn: () => {
      if (!filter) return [];
      const qs = new URLSearchParams({ from: filter.from, to: filter.to });
      if (filter.instructorId) qs.set('instructorId', filter.instructorId);
      return api<AdminClass[]>(`/admin/classes?${qs}`);
    },
  });
}

export function useInstructorGoogleCalendar(instructorId: string) {
  return useQuery({
    queryKey: googleCalendarKey(instructorId),
    queryFn: () =>
      api<InstructorGoogleCalendar>(
        `/admin/instructors/${instructorId}/google-calendar`,
      ),
  });
}

export function setInstructorGoogleCalendar(
  instructorId: string,
  body: InstructorGoogleCalendarInput,
) {
  return api<InstructorGoogleCalendar>(
    `/admin/instructors/${instructorId}/google-calendar`,
    { method: 'PATCH', body },
  );
}

export function useSetInstructorGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      instructorId,
      ...body
    }: InstructorGoogleCalendarInput & { instructorId: string }) =>
      setInstructorGoogleCalendar(instructorId, body),
    onSuccess: (result) => {
      qc.setQueryData(googleCalendarKey(result.instructorId), result);
      return qc.invalidateQueries({ queryKey: instructorCalendarsKey });
    },
  });
}

export function useInstructorCalendars() {
  return useQuery({
    queryKey: instructorCalendarsKey,
    queryFn: () =>
      api<InstructorCalendarsOverview>('/admin/instructor-calendars'),
  });
}

export function useSuggestInstructorCalendars() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<SuggestCalendarsResult>('/admin/instructor-calendars/suggest', {
        method: 'POST',
      }),
    onSuccess: (result) => {
      qc.setQueryData(instructorCalendarsKey, result.overview);
      return qc.invalidateQueries({
        queryKey: ['admin', 'instructor'],
      });
    },
  });
}
