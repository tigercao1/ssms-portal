import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PublicPage } from '@/lib/types';

const pagesKey = ['admin', 'pages'] as const;
const contentKey = (id: string) => [...pagesKey, id, 'content'] as const;

export function usePublicPages() {
  return useQuery({
    queryKey: pagesKey,
    queryFn: () => api<PublicPage[]>('/admin/pages'),
  });
}

export function usePublicPage(id: string) {
  return useQuery({
    queryKey: pagesKey,
    queryFn: () => api<PublicPage[]>('/admin/pages'),
    select: (pages) => pages.find((p) => p.id === id) ?? null,
  });
}

export function usePageContent(id: string, enabled: boolean) {
  return useQuery({
    queryKey: contentKey(id),
    queryFn: () =>
      api<string>(`/admin/pages/${id}/content`, { responseType: 'text' }),
    enabled,
  });
}

export function useDownloadPageHtml(id: string) {
  return useMutation({
    mutationFn: () =>
      api<Blob>(`/admin/pages/${id}/download`, { responseType: 'blob' }),
  });
}

function readFileBytes(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function useStorePage() {
  const qc = useQueryClient();
  return (page: PublicPage) => {
    qc.setQueryData<PublicPage[]>(pagesKey, (pages) =>
      pages ? [page, ...pages.filter((p) => p.id !== page.id)] : [page],
    );
    return qc.invalidateQueries({ queryKey: pagesKey, exact: true });
  };
}

export function useCreatePage() {
  const store = useStorePage();
  return useMutation({
    mutationFn: (body: { slug: string; title: string }) =>
      api<PublicPage>('/admin/pages', { method: 'POST', body }),
    onSuccess: store,
  });
}

export function useUpdatePageTitle(id: string) {
  const store = useStorePage();
  return useMutation({
    mutationFn: (title: string) =>
      api<PublicPage>(`/admin/pages/${id}`, {
        method: 'PATCH',
        body: { title },
      }),
    onSuccess: store,
  });
}

export function useUploadPageContent(id: string) {
  const qc = useQueryClient();
  const store = useStorePage();
  return useMutation({
    mutationFn: async (file: File) =>
      api<PublicPage>(`/admin/pages/${id}/content`, {
        method: 'PUT',
        body: await readFileBytes(file),
        contentType: 'text/html',
      }),
    onSuccess: (page) =>
      Promise.all([
        store(page),
        qc.invalidateQueries({ queryKey: contentKey(id) }),
      ]),
  });
}

export function usePublishPage(id: string, action: 'publish' | 'unpublish') {
  const store = useStorePage();
  return useMutation({
    mutationFn: () =>
      api<PublicPage>(`/admin/pages/${id}/${action}`, { method: 'POST' }),
    onSuccess: store,
  });
}

export function useDeletePage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/admin/pages/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: contentKey(id) });
      void qc.invalidateQueries({ queryKey: pagesKey, exact: true });
    },
  });
}
