import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { navigateExternal } from '@/lib/navigation';
import type {
  GoogleCalendar,
  GoogleCalendarAccessRole,
  GoogleConnectionStatus,
  GoogleConnectResponse,
} from '@/lib/types';

const statusKey = ['admin', 'google', 'status'] as const;
const calendarsKey = ['admin', 'google', 'calendars'] as const;

const WRITABLE_ROLES: readonly GoogleCalendarAccessRole[] = ['owner', 'writer'];

export function canWriteEvents(role: GoogleCalendarAccessRole) {
  return WRITABLE_ROLES.includes(role);
}

export function useGoogleStatus() {
  return useQuery({
    queryKey: statusKey,
    queryFn: () => api<GoogleConnectionStatus>('/admin/google/status'),
  });
}

export function useGoogleCalendars() {
  return useQuery({
    queryKey: calendarsKey,
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
      api<unknown>('/admin/google/disconnect', { method: 'POST' }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: statusKey }),
        qc.removeQueries({ queryKey: calendarsKey }),
      ]),
  });
}
