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
import { filenameFromDisposition } from './lessonRules';

const lessonTypesKey = ['admin', 'lesson-types'] as const;
const payRatesKey = ['admin', 'pay-rates'] as const;
const instructorCalendarsKey = ['admin', 'instructor-calendars'] as const;
const googleCalendarKey = (instructorId: string) =>
  ['admin', 'instructor', instructorId, 'google-calendar'] as const;

export interface ClassFilter {
  from?: string;
  to?: string;
  instructorId?: string;
  q?: string;
  status?: string;
  lessonTypeId?: string;
  locationId?: string;
  createdFrom?: string;
  sort?: 'startsAt' | 'createdAt';
}

function classFilterParams(filter: ClassFilter): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filter))
    if (value) qs.set(key, value);
  return qs;
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
      const qs = classFilterParams(filter);
      qs.set('limit', String(CLASSES_PAGE_SIZE));
      qs.set('page', String(page));
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

export interface CalendarClasses {
  classes: AdminClass[];
  total: number;
}

export function useCalendarClasses(filter: ClassFilter) {
  return useQuery({
    queryKey: ['admin', 'classes', 'calendar', filter] as const,
    queryFn: async (): Promise<CalendarClasses> => {
      const { data, headers } = await apiWithHeaders<AdminClass[]>(
        `/admin/classes?${classFilterParams(filter)}`,
      );
      const total = Number(headers.get('X-Total-Count') ?? Number.NaN);
      return {
        classes: data,
        total: Number.isFinite(total) ? total : data.length,
      };
    },
    placeholderData: keepPreviousData,
  });
}

export interface ClassesExport {
  blob: Blob;
  filename: string | null;
}

export async function fetchClassesExport(
  filter: ClassFilter,
): Promise<ClassesExport> {
  const { data, headers } = await apiWithHeaders<Blob>(
    `/admin/classes/export?${classFilterParams(filter)}`,
    { responseType: 'blob' },
  );
  return {
    blob: data,
    filename: filenameFromDisposition(headers.get('Content-Disposition')),
  };
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
      return Promise.all([
        qc.invalidateQueries({ queryKey: instructorCalendarsKey }),
        qc.invalidateQueries({ queryKey: ['admin', 'instructors'] }),
      ]);
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
