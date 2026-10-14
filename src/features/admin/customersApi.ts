import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, apiWithHeaders } from '@/lib/api';
import type {
  Customer,
  CustomerCreate,
  CustomerSyncResult,
  CustomerSyncStatus,
} from '@/lib/types';

const customersKey = ['admin', 'customers'] as const;
export const CUSTOMERS_PAGE_SIZE = 50;
const SYNC_STATUS_REFRESH_MS = 60_000;

export interface CustomerPage {
  customers: Customer[];
  total: number;
  page: number;
}

export function useCustomerSearch(q: string) {
  return useQuery({
    queryKey: [...customersKey, q] as const,
    queryFn: () => {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      const query = qs.toString();
      return api<Customer[]>(`/admin/customers${query ? `?${query}` : ''}`);
    },
  });
}

export function useCustomerPage(q: string, page: number) {
  return useQuery({
    queryKey: [...customersKey, 'page', q, page] as const,
    queryFn: async (): Promise<CustomerPage> => {
      const qs = new URLSearchParams({
        limit: String(CUSTOMERS_PAGE_SIZE),
        page: String(page),
      });
      if (q) qs.set('q', q);
      const { data, headers } = await apiWithHeaders<Customer[]>(
        `/admin/customers?${qs.toString()}`,
      );
      const total = Number(headers.get('X-Total-Count') ?? Number.NaN);
      return {
        customers: data,
        page,
        total: Number.isFinite(total)
          ? total
          : (page - 1) * CUSTOMERS_PAGE_SIZE + data.length,
      };
    },
    placeholderData: keepPreviousData,
  });
}

export function useCustomerSyncStatus() {
  return useQuery({
    queryKey: [...customersKey, 'sync-status'] as const,
    queryFn: () => api<CustomerSyncStatus>('/admin/customers/sync-status'),
    refetchInterval: SYNC_STATUS_REFRESH_MS,
  });
}

export function useSyncCustomers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<CustomerSyncResult>('/admin/customers/sync', {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: customersKey }),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomerCreate) =>
      api<Customer>('/admin/customers', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: customersKey }),
  });
}
