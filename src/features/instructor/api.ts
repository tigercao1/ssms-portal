import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type {
  AllowedAvatarMime,
  AvatarUploadTicket,
  BioAiUsage,
  BioDraft,
  BioDraftMode,
  ExtraPhotoSlot,
  InstructorProfile,
  PhotoSlot,
  UpdateProfileBody,
} from '@/lib/types';
import { MAX_AVATAR_BYTES } from '@/lib/types';
import { resizeImage } from '@/lib/resizeImage';

const PROFILE_KEY = ['me', 'instructor'] as const;

/** W2.1 — fetch (auto-creating) the caller's profile. */
export function useMyProfile() {
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => api<InstructorProfile>('/me/instructor'),
    refetchOnWindowFocus: 'always',
  });
}

/** W2.2 — patch the caller's profile. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileBody) =>
      api<InstructorProfile>('/me/instructor', { method: 'PATCH', body }),
    onSuccess: (profile) => qc.setQueryData(PROFILE_KEY, profile),
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
  if (error.status === 503 && code === 'bio_ai_unavailable') return 'unavailable';
  return 'generic';
}

/** Asks the model for both languages; saves nothing. Keeps the usage cache current. */
export function useBioDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; mode: BioDraftMode }) =>
      api<BioDraft>('/me/instructor/bio/draft', { method: 'POST', body }),
    onSuccess: (draft) => qc.setQueryData(BIO_USAGE_KEY, draft.usage),
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
    onSuccess: (profile) => qc.setQueryData(PROFILE_KEY, profile),
  });
}

export function useUploadPhoto(slot: ExtraPhotoSlot) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      uploadAvatar(file, '/me/instructor/photo', slot),
    onSuccess: (profile) => qc.setQueryData(PROFILE_KEY, profile),
  });
}

export function useRemovePhoto(slot: ExtraPhotoSlot) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => removePhoto('/me/instructor/photo', slot),
    onSuccess: (profile) => {
      if (profile) qc.setQueryData(PROFILE_KEY, profile);
      else void qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}
