import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ShopifyInstructorSync,
  ShopifySyncRunResult,
  ShopifySyncStatus,
} from '@/lib/types';

export const SHOPIFY_SYNC_POLL_MS = 10_000;

const statusKey = ['admin', 'shopify-sync', 'status'] as const;
const instructorKey = (id: string) =>
  ['admin', 'shopify-sync', 'instructor', id] as const;

export function isSyncEffective(status: ShopifySyncStatus | undefined) {
  return Boolean(
    status && status.enabled && status.masterSwitch && status.configured,
  );
}

export function useShopifySyncStatus({
  poll = false,
}: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: statusKey,
    queryFn: () => api<ShopifySyncStatus>('/admin/shopify-sync/status'),
    refetchInterval: poll ? SHOPIFY_SYNC_POLL_MS : false,
  });
}

export function useSetShopifySyncEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api<unknown>('/admin/shopify-sync', {
        method: 'PATCH',
        body: { enabled },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: statusKey }),
  });
}

export function useRunShopifySync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instructorId?: string) =>
      api<ShopifySyncRunResult>('/admin/shopify-sync/run', {
        method: 'POST',
        body: instructorId ? { instructorId } : {},
      }),
    onSuccess: (_result, instructorId) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: statusKey }),
        instructorId
          ? qc.invalidateQueries({ queryKey: instructorKey(instructorId) })
          : undefined,
      ]),
  });
}

export function useShopifyInstructorSync(id: string) {
  return useQuery({
    queryKey: instructorKey(id),
    queryFn: () =>
      api<ShopifyInstructorSync>(`/admin/shopify-sync/instructors/${id}`),
    refetchInterval: (query) =>
      query.state.data?.queued ? SHOPIFY_SYNC_POLL_MS : false,
  });
}
