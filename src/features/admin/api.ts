import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, apiWithHeaders } from '@/lib/api';
import { removePhoto, uploadAvatar } from '@/features/instructor/api';
import { documentsKeys } from '@/features/documents/api';
import { SEASONS_KEY, type AdminSeason } from '@/features/reference/api';
import type {
  AdminInstructorRecord,
  ApprovalStatus,
  CurrentUserRole,
  DeletedReferenceRecord,
  ExtraPhotoSlot,
  GoLiveReadiness,
  InstructorProfile,
  InstructorStage,
  InstructorStageCounts,
  ReferenceRecord,
  ReferenceUsage,
  UpdateProfileBody,
  UserRole,
  UserRoleRecord,
} from '@/lib/types';

export interface AdminListFilter {
  status?: ApprovalStatus;
  active?: boolean;
}

const listKey = (f: AdminListFilter) => ['admin', 'instructors', f] as const;
const detailKey = (id: string) => ['admin', 'instructor', id] as const;
const profileKey = (id: string) =>
  ['admin', 'instructor', id, 'profile'] as const;
export const adminGoLiveKey = (id: string) =>
  ['admin', 'instructor', id, 'go-live'] as const;
const roleKey = (authUserId: string) => ['admin', 'user-role', authUserId] as const;

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
    refetchOnWindowFocus: 'always',
  });
}

export function useAdminStageCounts() {
  return useQuery({
    queryKey: ['admin', 'instructors', 'stage-counts'] as const,
    queryFn: () =>
      api<InstructorStageCounts>('/admin/instructors/stage-counts'),
    refetchOnWindowFocus: 'always',
  });
}

export const INSTRUCTORS_PAGE_SIZE = 50;

export interface AdminInstructorPageQuery {
  stages: InstructorStage[];
  calendarConnected?: boolean;
  q: string;
  page: number;
}

export interface AdminInstructorPage {
  instructors: AdminInstructorRecord[];
  total: number;
  page: number;
}

export function useAdminInstructorPage({
  q,
  stages,
  calendarConnected,
  page,
}: AdminInstructorPageQuery) {
  return useQuery({
    queryKey: [
      'admin',
      'instructors',
      'page',
      { q, stages, calendarConnected, page },
    ] as const,
    queryFn: async (): Promise<AdminInstructorPage> => {
      const qs = new URLSearchParams({
        limit: String(INSTRUCTORS_PAGE_SIZE),
        page: String(page),
      });
      if (q) qs.set('q', q);
      for (const stage of stages) qs.append('stage', stage);
      if (calendarConnected !== undefined)
        qs.set('calendarConnected', String(calendarConnected));
      const { data, headers } = await apiWithHeaders<AdminInstructorRecord[]>(
        `/admin/instructors?${qs.toString()}`,
      );
      const total = Number(headers.get('X-Total-Count') ?? Number.NaN);
      return {
        instructors: data,
        page,
        total: Number.isFinite(total)
          ? total
          : (page - 1) * INSTRUCTORS_PAGE_SIZE + data.length,
      };
    },
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: 'always',
  });
}

export type OnboardingFilter = 'complete' | 'incomplete';

export interface InstructorExportQuery {
  stages: InstructorStage[];
  onboarding?: OnboardingFilter;
}

export interface InstructorExport {
  text: string;
  nonAsciiNames: number;
}

export async function fetchInstructorExport({
  stages,
  onboarding,
}: InstructorExportQuery): Promise<InstructorExport> {
  const qs = new URLSearchParams();
  for (const stage of stages) qs.append('stage', stage);
  if (onboarding) qs.set('onboarding', onboarding);
  const { data, headers } = await apiWithHeaders<string>(
    `/admin/instructors/export.csv?${qs.toString()}`,
    { responseType: 'text' },
  );
  return {
    text: data.startsWith('\uFEFF') ? data : `\uFEFF${data}`,
    nonAsciiNames: Number(headers.get('X-Export-Non-Ascii-Names')) || 0,
  };
}

/** W2.8 — single instructor detail. */
export function useAdminInstructor(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => api<AdminInstructorRecord>(`/admin/instructors/${id}`),
    refetchOnWindowFocus: 'always',
  });
}

export function useAdminInstructorProfile(id: string) {
  return useQuery({
    queryKey: profileKey(id),
    queryFn: () => api<InstructorProfile>(`/admin/instructors/${id}/profile`),
  });
}

export function useAdminGoLive(id: string) {
  return useQuery({
    queryKey: adminGoLiveKey(id),
    queryFn: () => api<GoLiveReadiness>(`/admin/instructors/${id}/go-live`),
    refetchOnWindowFocus: 'always',
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

function useInvalidateWithDocuments(id: string) {
  const qc = useQueryClient();
  const sync = useInvalidate(id);
  return (record?: AdminInstructorRecord) => {
    sync(record);
    void qc.invalidateQueries({ queryKey: documentsKeys.templates });
  };
}

/** W2.9 — approve / reject. */
export function useSetApproval(id: string) {
  const sync = useInvalidateWithDocuments(id);
  return useMutation({
    mutationFn: (vars: {
      approvalStatus: 'approved' | 'rejected';
      reason?: string;
    }) =>
      api<AdminInstructorRecord>(`/admin/instructors/${id}/approval`, {
        method: 'PATCH',
        body: vars,
      }),
    onSettled: (record) => sync(record),
  });
}

/** W2.10 — activate / deactivate. */
export function useSetActivation(id: string) {
  const sync = useInvalidateWithDocuments(id);
  return useMutation({
    mutationFn: (isActive: boolean) =>
      api<AdminInstructorRecord>(`/admin/instructors/${id}/activation`, {
        method: 'PATCH',
        body: { isActive },
      }),
    onSuccess: sync,
  });
}

export function useAdminUserRole(authUserId: string) {
  return useQuery({
    queryKey: roleKey(authUserId),
    queryFn: () => api<CurrentUserRole>(`/admin/users/${authUserId}/role`),
  });
}

/** W2.11 — promote / demote (id = authUserId). */
export function useSetRole(authUserId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: UserRole) =>
      api<UserRoleRecord>(`/admin/users/${authUserId}/role`, {
        method: 'PATCH',
        body: { role },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'instructors'] });
      void qc.invalidateQueries({ queryKey: roleKey(authUserId) });
    },
  });
}

function useSyncProfile(id: string) {
  const qc = useQueryClient();
  const sync = useInvalidate(id);
  return (profile: InstructorProfile) => {
    qc.setQueryData(profileKey(id), profile);
    sync();
  };
}

export function useAdminUpdateProfile(id: string) {
  const sync = useSyncProfile(id);
  return useMutation({
    mutationFn: (body: UpdateProfileBody) =>
      api<InstructorProfile>(`/admin/instructors/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: sync,
  });
}

export function useAdminUploadPhoto(id: string, slot?: ExtraPhotoSlot) {
  const sync = useSyncProfile(id);
  return useMutation({
    mutationFn: (file: File) =>
      uploadAvatar(file, `/admin/instructors/${id}/photo`, slot),
    onSuccess: sync,
  });
}

export function useAdminRemovePhoto(id: string, slot: ExtraPhotoSlot) {
  const qc = useQueryClient();
  const sync = useSyncProfile(id);
  return useMutation({
    mutationFn: () => removePhoto(`/admin/instructors/${id}/photo`, slot),
    onSuccess: (profile) => {
      if (profile) sync(profile);
      else void qc.invalidateQueries({ queryKey: profileKey(id) });
    },
  });
}

export function useSetDisplayOrder(id: string) {
  const sync = useInvalidate(id);
  return useMutation({
    mutationFn: (displayOrder: number | null) =>
      api<AdminInstructorRecord>(`/admin/instructors/${id}/display-order`, {
        method: 'PATCH',
        body: { displayOrder },
      }),
    onSuccess: sync,
  });
}

const adminReferenceKey = (slug: string) =>
  ['admin', 'reference', slug] as const;

function useInvalidateReference(slug: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: adminReferenceKey(slug) }),
      qc.invalidateQueries({ queryKey: ['reference', slug] }),
    ]);
}

export function useAdminReferences(slug: string) {
  return useQuery({
    queryKey: adminReferenceKey(slug),
    queryFn: () => api<ReferenceRecord[]>(`/admin/reference/${slug}`),
  });
}

/** W2.13 — append a reference row. */
export function useAddReference(slug: string) {
  const invalidate = useInvalidateReference(slug);
  return useMutation({
    mutationFn: (body: {
      key: string;
      name?: string;
      nameZh?: string;
      sortOrder?: number;
      isActive?: boolean;
    }) =>
      api<ReferenceRecord>(`/admin/reference/${slug}`, {
        method: 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateReference(slug: string) {
  const invalidate = useInvalidateReference(slug);
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      isActive?: boolean;
      name?: string;
      nameZh?: string | null;
      sortOrder?: number;
    }) =>
      api<ReferenceRecord>(`/admin/reference/${slug}/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useReferenceUsage(slug: string, id: string | null) {
  return useQuery({
    queryKey: [...adminReferenceKey(slug), id, 'usage'] as const,
    queryFn: () => api<ReferenceUsage>(`/admin/reference/${slug}/${id}/usage`),
    enabled: id !== null,
    staleTime: 0,
  });
}

export function useDeleteReference(slug: string) {
  const invalidate = useInvalidateReference(slug);
  return useMutation({
    mutationFn: (id: string) =>
      api<DeletedReferenceRecord>(`/admin/reference/${slug}/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  });
}

const ADMIN_SEASONS_KEY = ['admin', 'reference', 'seasons'] as const;
const seasonPath = (key: string) =>
  `/admin/reference/seasons/${encodeURIComponent(key)}`;

function useInvalidateSeasons() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ADMIN_SEASONS_KEY }),
      qc.invalidateQueries({ queryKey: SEASONS_KEY }),
    ]);
}

export function useAdminSeasons() {
  return useQuery({
    queryKey: ADMIN_SEASONS_KEY,
    queryFn: () => api<AdminSeason[]>('/admin/reference/seasons'),
  });
}

export function useAddSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: (body: { key: string; startsOn: string; endsOn: string }) =>
      api<AdminSeason>('/admin/reference/seasons', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: ({
      key,
      ...body
    }: {
      key: string;
      startsOn?: string;
      endsOn?: string;
    }) => api<AdminSeason>(seasonPath(key), { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: (key: string) =>
      api<AdminSeason>(seasonPath(key), { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
