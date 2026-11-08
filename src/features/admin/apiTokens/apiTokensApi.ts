import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { Messages } from '@/i18n/core/types';
import type {
  ApiToken,
  CreateApiTokenBody,
  IssuedApiToken,
  RotateApiTokenBody,
} from './types';

const tokensKey = ['admin', 'api-tokens'] as const;

export function useApiTokens() {
  return useQuery({
    queryKey: tokensKey,
    queryFn: () => api<ApiToken[]>('/admin/api-tokens'),
  });
}

export function useCreateApiToken() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (body: CreateApiTokenBody) =>
      api<IssuedApiToken>('/admin/api-tokens', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tokensKey }),
  });
}

export function useRotateApiToken() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: ({ id, body }: { id: string; body: RotateApiTokenBody }) =>
      api<IssuedApiToken>(
        `/admin/api-tokens/${encodeURIComponent(id)}/rotate`,
        { method: 'POST', body },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: tokensKey }),
  });
}

export function useRevokeApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/api-tokens/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tokensKey }),
  });
}

export function tokenErrorText(error: unknown, t: Messages): string {
  if (!(error instanceof ApiError)) return t.errors.generic;
  if (error.status === 403) return t.apiTokens.sessionOnly;
  if (error.status === 429) return t.apiTokens.rateLimited;
  return error.message;
}
