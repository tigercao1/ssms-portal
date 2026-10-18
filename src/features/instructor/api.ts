import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountSwitchedError, api, ApiError } from '@/lib/api';
import { queryClientAccount } from '@/lib/query';
import { getSessionSnapshot } from '@/lib/supabase';
import type {
  AllowedAvatarMime,
  AvatarUploadTicket,
  BioAiUsage,
  BioDraft,
  BioDraftMode,
  ExtraPhotoSlot,
  GoLiveReadiness,
  InstructorProfile,
  MyCalendarStatus,
  PhotoSlot,
  UpdateProfileBody,
} from '@/lib/types';
import { MAX_AVATAR_BYTES } from '@/lib/types';
import { resizeImage } from '@/lib/resizeImage';
import { track } from '@/lib/analytics';

const PROFILE_KEY = ['me', 'instructor'] as const;
export const MY_GO_LIVE_KEY = ['me', 'go-live'] as const;

/** W2.1 — fetch (auto-creating) the caller's profile. */
export function useMyProfile() {
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => api<InstructorProfile>('/me/instructor'),
    refetchOnWindowFocus: 'always',
  });
}

export function useMyCalendarStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['me', 'instructor', 'calendar'] as const,
    queryFn: () => api<MyCalendarStatus>('/me/instructor/calendar'),
    enabled,
  });
}

export const GO_LIVE_POLL_MS = 10_000;

export function useMyGoLive(enabled: boolean) {
  return useQuery({
    queryKey: MY_GO_LIVE_KEY,
    queryFn: () => api<GoLiveReadiness>('/me/go-live'),
    enabled,
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.ready && !data.live ? GO_LIVE_POLL_MS : false;
    },
  });
}

/** W2.2 — patch the caller's profile; refuses unless the session still owns the cached data. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  const owner = queryClientAccount(qc);
  return useMutation({
    mutationFn: async (body: UpdateProfileBody) => {
      const current = await getSessionSnapshot();
      if (owner === undefined || owner !== current.userId)
        throw new AccountSwitchedError();
      return api<InstructorProfile>('/me/instructor', {
        method: 'PATCH',
        body,
        accessToken: current.accessToken,
      });
    },
    onSuccess: (profile) => {
      qc.setQueryData(PROFILE_KEY, profile);
      void qc.invalidateQueries({ queryKey: MY_GO_LIVE_KEY });
      track('profile_saved');
    },
  });
}

const BIO_USAGE_KEY = ['me', 'instructor', 'bio', 'ai-usage'] as const;

/** Remaining Refine / Use-as-written requests for today. */
export function useBioAiUsage() {
  return useQuery({
    queryKey: BIO_USAGE_KEY,
    queryFn: () => api<BioAiUsage>('/me/instructor/bio/ai-usage'),
  });
}

export type BioDraftError = 'limit' | 'unavailable' | 'generic';

export function bioDraftError(error: unknown): BioDraftError {
  if (!(error instanceof ApiError)) return 'generic';
  const code = (error.body as { code?: string } | undefined)?.code;
  if (error.status === 429 && code === 'bio_ai_limit') return 'limit';
  if (error.status === 503 && code === 'bio_ai_unavailable')
    return 'unavailable';
  return 'generic';
}

/** Asks the model for both languages; saves nothing. Keeps the usage cache current. */
export function useBioDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; mode: BioDraftMode }) =>
      api<BioDraft>('/me/instructor/bio/draft', { method: 'POST', body }),
    onSuccess: (draft, { mode }) => {
      qc.setQueryData(BIO_USAGE_KEY, draft.usage);
      track('bio_draft_generated', { mode });
    },
    onError: (error) => {
      const usage =
        error instanceof ApiError
          ? (error.body as { usage?: BioAiUsage } | undefined)?.usage
          : undefined;
      if (usage) qc.setQueryData(BIO_USAGE_KEY, usage);
    },
  });
}

const ALLOWED: AllowedAvatarMime[] = ['image/jpeg', 'image/png', 'image/webp'];

export function validateAvatarType(file: Blob): string | null {
  if (!ALLOWED.includes(file.type as AllowedAvatarMime)) {
    return 'Use a JPEG, PNG or WebP image.';
  }
  return null;
}

export function validateAvatar(file: Blob): string | null {
  const typeError = validateAvatarType(file);
  if (typeError) return typeError;
  if (file.size > MAX_AVATAR_BYTES) {
    return 'Image must be 5 MB or smaller.';
  }
  return null;
}

export async function prepareAvatar(file: Blob): Promise<Blob> {
  const typeError = validateAvatarType(file);
  if (typeError) throw new Error(typeError);
  const resized = await resizeImage(file).catch(() => null);
  const keepOriginal =
    !resized || (resized.size >= file.size && validateAvatar(file) === null);
  const chosen = keepOriginal ? file : resized;
  const error = validateAvatar(chosen);
  if (error) throw new Error(error);
  return chosen;
}

/**
 * W2.3 — resize, then three-step avatar upload: get a signed URL from the API,
 * PUT the bytes to Supabase Storage, then confirm so the API persists the
 * public URL.
 */
export async function uploadAvatar(
  original: File,
  photoPath: string,
  slot?: PhotoSlot,
): Promise<InstructorProfile> {
  const file = await prepareAvatar(original);
  const contentType = file.type as AllowedAvatarMime;
  const slotBody = slot === undefined ? {} : { slot };
  const ticket = await api<AvatarUploadTicket>(
    `${photoPath}/signed-upload-url`,
    {
      method: 'POST',
      body: { contentType, contentLength: file.size, ...slotBody },
    },
  );

  const put = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
    body: file,
  });
  if (!put.ok) {
    const detail = await put.text().catch(() => '');
    throw new Error(
      `Storage upload failed (${put.status}). ${detail.slice(0, 300)}`,
    );
  }

  return api<InstructorProfile>(`${photoPath}/confirm`, {
    method: 'POST',
    body: { contentType, ...slotBody },
  });
}

export function removePhoto(
  photoPath: string,
  slot: PhotoSlot,
): Promise<InstructorProfile | undefined> {
  return api<InstructorProfile | undefined>(`${photoPath}/${slot}`, {
    method: 'DELETE',
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadAvatar(file, '/me/instructor/photo'),
    onSuccess: (profile) => {
      qc.setQueryData(PROFILE_KEY, profile);
      void qc.invalidateQueries({ queryKey: MY_GO_LIVE_KEY });
      track('photo_uploaded', { slot: 'avatar' });
    },
  });
}

export function useUploadPhoto(slot: ExtraPhotoSlot) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      uploadAvatar(file, '/me/instructor/photo', slot),
    onSuccess: (profile) => {
      qc.setQueryData(PROFILE_KEY, profile);
      track('photo_uploaded', { slot });
    },
  });
}

export function useRemovePhoto(slot: ExtraPhotoSlot) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => removePhoto('/me/instructor/photo', slot),
    onSuccess: (profile) => {
      track('photo_removed', { slot });
      if (profile) qc.setQueryData(PROFILE_KEY, profile);
      else void qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}
