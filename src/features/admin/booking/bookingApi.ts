import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { warnIfSyncFailed } from './syncToast';
import type {
  Availability,
  BookableStatus,
  BookedClass,
  BookingSettings,
  BookingSettingsInput,
  CreateBookingInput,
  LastClass,
  SyncIssues,
  UpdateBookingInput,
} from './types';

const settingsKey = ['admin', 'booking', 'settings'] as const;
const availabilityKey = ['admin', 'booking', 'availability'] as const;
const classesKey = ['admin', 'classes'] as const;
const syncIssuesKey = ['admin', 'booking', 'sync-issues'] as const;

function useRefreshBookings() {
  const qc = useQueryClient();
  return (saved: BookedClass | BookedClass[]) => {
    warnIfSyncFailed(saved);
    return Promise.all([
      qc.invalidateQueries({ queryKey: availabilityKey }),
      qc.invalidateQueries({ queryKey: classesKey }),
      qc.invalidateQueries({ queryKey: syncIssuesKey }),
    ]);
  };
}

export function useBookingSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => api<BookingSettings>('/admin/booking/settings'),
  });
}

export function useSaveBookingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BookingSettingsInput) =>
      api<BookingSettings>('/admin/booking/settings', { method: 'PUT', body }),
    onSuccess: (saved) => {
      qc.setQueryData(settingsKey, saved);
      return qc.invalidateQueries({ queryKey: availabilityKey });
    },
  });
}

export function useAvailability(
  query: { date: string; lessonTypeId: string } | null,
) {
  return useQuery({
    queryKey: [...availabilityKey, query] as const,
    enabled: query !== null,
    queryFn: () => {
      if (!query) throw new Error('availability query missing');
      const qs = new URLSearchParams(query);
      return api<Availability>(`/admin/booking/availability?${qs}`);
    },
  });
}

export function useCreateBooking() {
  const refresh = useRefreshBookings();
  return useMutation({
    mutationFn: (body: CreateBookingInput) =>
      api<BookedClass[]>('/admin/booking/classes', { method: 'POST', body }),
    onSuccess: refresh,
  });
}

export function useUpdateBooking() {
  const refresh = useRefreshBookings();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateBookingInput & { id: string }) =>
      api<BookedClass>(`/admin/booking/classes/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: refresh,
  });
}

export function useCancelBooking() {
  const refresh = useRefreshBookings();
  return useMutation({
    mutationFn: (id: string) =>
      api<BookedClass>(`/admin/booking/classes/${id}/cancel`, {
        method: 'POST',
      }),
    onSuccess: refresh,
  });
}

export function useSetClassStatus() {
  const refresh = useRefreshBookings();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookableStatus }) =>
      api<BookedClass>(`/admin/booking/classes/${id}/status`, {
        method: 'POST',
        body: { status },
      }),
    onSuccess: refresh,
  });
}

export function useRetrySync() {
  const refresh = useRefreshBookings();
  return useMutation({
    mutationFn: (id: string) =>
      api<BookedClass>(`/admin/booking/classes/${id}/sync`, {
        method: 'POST',
      }),
    onSuccess: refresh,
  });
}

export function useSyncIssues() {
  return useQuery({
    queryKey: syncIssuesKey,
    queryFn: () => api<SyncIssues>('/admin/booking/sync-issues'),
  });
}

export function fetchLastClass(customerId: string) {
  return api<{ last: LastClass | null }>(
    `/admin/booking/customers/${customerId}/last`,
  );
}
