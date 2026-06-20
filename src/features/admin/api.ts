import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AdminInstructorRecord,
  ApprovalStatus,
  ReferenceRecord,
  UpdateProfileBody,
  UserRoleRecord,
} from '@/lib/types';

export interface AdminListFilter {
  status?: ApprovalStatus;
  active?: boolean;
}

const listKey = (f: AdminListFilter) => ['admin', 'instructors', f] as const;
const detailKey = (id: string) => ['admin', 'instructor', id] as const;

/** W2.7 — list instructors with optional status/active filters. */
export function useAdminInstructors(filter: AdminListFilter) {
  return useQuery({
    queryKey: listKey(filter),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filter.status) qs.set('status', filter.status);
      if (filter.active !== undefined) qs.set('active', String(filter.active));
      const suffix = qs.toString() ? `?${qs}` : '';
      return api<AdminInstructorRecord[]>(`/admin/instructors${suffix}`);
    },
  });
}

/** W2.8 — single instructor detail. */
export function useAdminInstructor(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => api<AdminInstructorRecord>(`/admin/instructors/${id}`),
  });
}

function useInvalidate(id: string) {
  const qc = useQueryClient();
  return (record?: AdminInstructorRecord) => {
    if (record) qc.setQueryData(detailKey(id), record);
    void qc.invalidateQueries({ queryKey: ['admin', 'instructors'] });
    void qc.invalidateQueries({ queryKey: detailKey(id) });
  };
}

/** W2.9 — approve / reject. */
export function useSetApproval(id: string) {
  const sync = useInvalidate(id);
  return useMutation({
    mutationFn: (vars: { approvalStatus: 'approved' | 'rejected'; reason?: string }) =>
      api<AdminInstructorRecord>(`/admin/instructors/${id}/approval`, {
        method: 'PATCH',
        body: vars,
      }),
    onSuccess: sync,
  });
}

/** W2.10 — activate / deactivate. */
export function useSetActivation(id: string) {
  const sync = useInvalidate(id);
  return useMutation({
    mutationFn: (isActive: boolean) =>
      api<AdminInstructorRecord>(`/admin/instructors/${id}/activation`, {
        method: 'PATCH',
        body: { isActive },
      }),
    onSuccess: sync,
  });
}

/** W2.11 — promote / demote (id = authUserId). */
export function useSetRole(authUserId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: 'admin' | 'instructor') =>
      api<UserRoleRecord>(`/admin/users/${authUserId}/role`, {
        method: 'PATCH',
        body: { role },
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin', 'instructors'] }),
  });
}

/** W2.12 — admin edits any instructor's profile (core fields). */
export function useAdminUpdateProfile(id: string) {
  const sync = useInvalidate(id);
  return useMutation({
    mutationFn: (body: UpdateProfileBody) =>
      api(`/admin/instructors/${id}`, { method: 'PATCH', body }),
    onSuccess: () => sync(),
  });
}

/** W2.13 — append a reference row. */
export function useAddReference(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      key: string;
      name: string;
      sortOrder?: number;
      isActive?: boolean;
    }) =>
      api<ReferenceRecord>(`/admin/reference/${slug}`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reference', slug] }),
  });
}
