import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AdminClass,
  LessonProduct,
  LessonProductPatch,
  LessonProductStatus,
  LessonProductSyncResult,
} from '@/lib/types';

const productsKey = ['admin', 'lesson-products'] as const;
const productsByStatusKey = (status: LessonProductStatus) =>
  [...productsKey, status] as const;

export interface ClassFilter {
  from: string;
  to: string;
  instructorId?: string;
}

export function useLessonProducts(status: LessonProductStatus) {
  return useQuery({
    queryKey: productsByStatusKey(status),
    queryFn: () =>
      api<LessonProduct[]>(`/admin/lesson-products?status=${status}`),
  });
}

export function patchLessonProduct(id: string, body: LessonProductPatch) {
  return api<LessonProduct>(`/admin/lesson-products/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function useUpdateLessonProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: LessonProductPatch & { id: string }) =>
      patchLessonProduct(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: productsKey }),
  });
}

export function useConfirmLessonProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      let confirmed = 0;
      for (const id of ids) {
        await patchLessonProduct(id, { status: 'confirmed' });
        confirmed += 1;
      }
      return confirmed;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: productsKey }),
  });
}

export function useSyncLessonProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<LessonProductSyncResult>('/admin/lesson-products/sync', {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: productsKey }),
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

export function useSetGoogleCalendarId(instructorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (googleCalendarId: string | null) =>
      api<unknown>(`/admin/instructors/${instructorId}/google-calendar`, {
        method: 'PATCH',
        body: { googleCalendarId },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: ['admin', 'instructor', instructorId],
        }),
        qc.invalidateQueries({ queryKey: ['admin', 'instructors'] }),
      ]),
  });
}
