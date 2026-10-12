import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Customer, CustomerCreate, CustomerSyncResult } from '@/lib/types';

const customersKey = ['admin', 'customers'] as const;

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
