import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, apiWithHeaders } from '@/lib/api';
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

export const CLASSES_PAGE_SIZE = 50;

export interface AdminClassPage {
  classes: AdminClass[];
  total: number;
  page: number;
}

export function useAdminClasses(filter: ClassFilter | null, page: number) {
  return useQuery({
    queryKey: ['admin', 'classes', 'page', filter, page] as const,
    enabled: filter !== null,
    queryFn: async (): Promise<AdminClassPage> => {
      if (!filter) return { classes: [], total: 0, page };
      const qs = new URLSearchParams({
        from: filter.from,
        to: filter.to,
        limit: String(CLASSES_PAGE_SIZE),
        page: String(page),
      });
      if (filter.instructorId) qs.set('instructorId', filter.instructorId);
      const { data, headers } = await apiWithHeaders<AdminClass[]>(
        `/admin/classes?${qs}`,
      );
      const total = Number(headers.get('X-Total-Count') ?? Number.NaN);
      return {
        classes: data,
        page,
        total: Number.isFinite(total)
          ? total
          : (page - 1) * CLASSES_PAGE_SIZE + data.length,
      };
    },
    placeholderData: keepPreviousData,
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
    {
      method: 'PATCH',
      body: { googleCalendarId: body.googleCalendarId },
    },
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
