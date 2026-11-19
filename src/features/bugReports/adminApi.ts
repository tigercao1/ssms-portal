import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/auth/SessionProvider';
import { api } from '@/lib/api';
import type {
  BugReportDetail,
  BugReportsPage,
  BugReportStatus,
  UpdateBugReportBody,
} from './types';

export const BUG_REPORTS_PAGE_SIZE = 25;
export const SCREENSHOT_URL_REFRESH_MS = 4 * 60_000;

const bugReportsKey = (userId: string | null) =>
  ['admin', userId, 'bug-reports'] as const;

function sameUserPlaceholder<T>(userId: string | null) {
  return (previous: T | undefined, query?: { queryKey: readonly unknown[] }) =>
    query?.queryKey[1] === userId ? previous : undefined;
}

export interface BugReportsListing extends BugReportsPage {
  page: number;
}

export function useBugReports(status: BugReportStatus | null, page: number) {
  const userId = useSession().user?.id ?? null;
  return useQuery({
    queryKey: [...bugReportsKey(userId), 'list', { status, page }] as const,
    enabled: userId !== null,
    placeholderData: sameUserPlaceholder<BugReportsListing>(userId),
    queryFn: async (): Promise<BugReportsListing> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(BUG_REPORTS_PAGE_SIZE),
      });
      if (status) params.set('status', status);
      return {
        ...(await api<BugReportsPage>(`/admin/bug-reports?${params}`)),
        page,
      };
    },
  });
}

export function useBugReport(id: string) {
  const userId = useSession().user?.id ?? null;
  return useQuery({
    queryKey: [...bugReportsKey(userId), 'detail', id] as const,
    enabled: userId !== null,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: SCREENSHOT_URL_REFRESH_MS,
    queryFn: () =>
      api<BugReportDetail>(`/admin/bug-reports/${encodeURIComponent(id)}`),
  });
}

export function useUpdateBugReport(id: string) {
  const userId = useSession().user?.id ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateBugReportBody) =>
      api<BugReportDetail>(`/admin/bug-reports/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (report) => {
      qc.setQueryData([...bugReportsKey(userId), 'detail', id], report);
      void qc.invalidateQueries({
        queryKey: [...bugReportsKey(userId), 'list'],
      });
    },
  });
}
