import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ClassImport,
  ClassImportDetail,
  CommitResult,
  EventMapEntry,
  EventMapResult,
  ImportRowPatch,
  RowFilter,
} from './importTypes';

const importsKey = ['admin', 'class-imports'] as const;
const importKey = (id: string) => [...importsKey, id] as const;

export function useClassImports() {
  return useQuery({
    queryKey: importsKey,
    queryFn: () => api<ClassImport[]>('/admin/class-imports'),
  });
}

export function useClassImport(id: string | null, filter: RowFilter | '') {
  return useQuery({
    queryKey: [...importKey(id ?? ''), filter] as const,
    queryFn: () =>
      api<ClassImportDetail>(
        `/admin/class-imports/${id}${filter ? `?problem=${filter}` : ''}`,
      ),
    enabled: Boolean(id),
  });
}

export function useUploadClassImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api<ClassImportDetail>('/admin/class-imports', {
        method: 'POST',
        body,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: importsKey }),
  });
}

export function useUpdateImportRow(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rowNo, ...body }: ImportRowPatch & { rowNo: number }) =>
      api<ClassImportDetail>(`/admin/class-imports/${id}/rows/${rowNo}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: importKey(id) }),
  });
}

export function useSaveEventMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mappings: EventMapEntry[]) =>
      api<EventMapResult>('/admin/class-imports/event-map', {
        method: 'PUT',
        body: { mappings },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: importsKey }),
  });
}

export function useCommitClassImport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<CommitResult>(`/admin/class-imports/${id}/commit`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: importsKey }),
  });
}

export function useDiscardClassImport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<ClassImport>(`/admin/class-imports/${id}/discard`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: importsKey }),
  });
}
