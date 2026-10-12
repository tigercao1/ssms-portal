import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { navigateExternal } from '@/lib/navigation';
import type {
  GoogleCalendar,
  GoogleConnectionStatus,
  GoogleConnectResponse,
} from '@/lib/types';

const statusKey = ['admin', 'google', 'status'] as const;
const calendarsKey = ['admin', 'google', 'calendars'] as const;

export function useGoogleStatus() {
  return useQuery({
    queryKey: statusKey,
    queryFn: () => api<GoogleConnectionStatus>('/admin/google/status'),
  });
}

export function useGoogleCalendars(enabled = true) {
  return useQuery({
    queryKey: calendarsKey,
    enabled,
    queryFn: () => api<GoogleCalendar[]>('/admin/google/calendars'),
  });
}

export function useConnectGoogle() {
  return useMutation({
    mutationFn: () => api<GoogleConnectResponse>('/admin/google/connect'),
    onSuccess: ({ url }) => navigateExternal(url),
  });
}

export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<GoogleConnectionStatus>('/admin/google/disconnect', {
        method: 'POST',
      }),
    onSuccess: (status) => {
      qc.setQueryData(statusKey, status);
      qc.removeQueries({ queryKey: calendarsKey });
    },
  });
}
