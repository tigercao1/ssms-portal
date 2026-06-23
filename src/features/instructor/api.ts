import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AllowedAvatarMime,
  AvatarUploadTicket,
  InstructorProfile,
  UpdateProfileBody,
} from '@/lib/types';
import { MAX_AVATAR_BYTES } from '@/lib/types';

const PROFILE_KEY = ['me', 'instructor'] as const;

/** W2.1 — fetch (auto-creating) the caller's profile. */
export function useMyProfile() {
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => api<InstructorProfile>('/me/instructor'),
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

const ALLOWED: AllowedAvatarMime[] = ['image/jpeg', 'image/png', 'image/webp'];

export function validateAvatar(file: File): string | null {
  if (!ALLOWED.includes(file.type as AllowedAvatarMime)) {
    return 'Use a JPEG, PNG or WebP image.';
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return 'Image must be 5 MB or smaller.';
  }
  return null;
}

/**
 * W2.3 — three-step avatar upload: get a signed URL from the API, PUT the bytes
 * to Supabase Storage, then confirm so the API persists the public URL.
 */
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<InstructorProfile> => {
      const contentType = file.type as AllowedAvatarMime;
      const ticket = await api<AvatarUploadTicket>(
        '/me/instructor/photo/signed-upload-url',
        { method: 'POST', body: { contentType, contentLength: file.size } },
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

      return api<InstructorProfile>('/me/instructor/photo/confirm', {
        method: 'POST',
        body: { contentType },
      });
    },
    onSuccess: (profile) => qc.setQueryData(PROFILE_KEY, profile),
  });
}

/** Helper used by Settings (W2.4) to persist preferred language. */
export async function persistPreferredLanguage(
  preferredLanguage: 'en' | 'zh-CN',
): Promise<InstructorProfile> {
  return api<InstructorProfile>('/me/instructor', {
    method: 'PATCH',
    body: { preferredLanguage },
  });
}
