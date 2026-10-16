import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AdminInsuranceFilter,
  AdminInsuranceRecord,
  AdminInsuranceRecordsPage,
  AdminInsuranceSummary,
} from '@/features/insurance/types';

const insuranceKey = ['admin', 'insurance'] as const;

export function useInsuranceSummary(season: string) {
  return useQuery({
    queryKey: [...insuranceKey, 'summary', season] as const,
    enabled: season !== '',
    queryFn: () =>
      api<AdminInsuranceSummary[]>(
        `/admin/insurance/summary?season=${encodeURIComponent(season)}`,
      ),
  });
}

export function recordsQuery(filter: AdminInsuranceFilter) {
  const params = new URLSearchParams({
    season: filter.season,
    page: String(filter.page),
    limit: String(filter.limit),
  });
  if (filter.instructorId) params.set('instructorId', filter.instructorId);
  if (filter.paymentStatus) params.set('paymentStatus', filter.paymentStatus);
  return params.toString();
}

export function useInsuranceRecords(filter: AdminInsuranceFilter) {
  return useQuery({
    queryKey: [...insuranceKey, 'records', filter] as const,
    enabled: filter.season !== '',
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<AdminInsuranceRecordsPage>(
        `/admin/insurance/records?${recordsQuery(filter)}`,
      ),
  });
}

function useRecordAction<TBody>(action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: TBody }) =>
      api<AdminInsuranceRecord>(
        `/admin/insurance/records/${encodeURIComponent(id)}/${action}`,
        { method: 'POST', body: body ?? {} },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: insuranceKey }),
  });
}

export const useMarkPaid = () =>
  useRecordAction<{ paidOn: string; note?: string }>('mark-paid');
export const useMarkUnpaid = () => useRecordAction<never>('mark-unpaid');
export const useVoidRecord = () => useRecordAction<{ reason: string }>('void');
