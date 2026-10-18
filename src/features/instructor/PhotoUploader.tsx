import { useRef, useState, type ReactNode } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { Banner, Button } from '@/components';
import {
  useRemovePhoto,
  useUploadAvatar,
  useUploadPhoto,
  validateAvatarType,
} from './api';
import type {
  ExtraPhotoSlot,
  InstructorProfile,
  PhotoSlot,
} from '@/lib/types';

type PhotoSubject = Pick<
  InstructorProfile,
  | 'displayNameEn'
  | 'displayNameZh'
  | 'profilePhotoUrl'
  | 'photo2Url'
  | 'photo3Url'
>;

export const EXTRA_PHOTO_SLOTS: readonly ExtraPhotoSlot[] = [2, 3];

export function photoUrlForSlot(
  profile: PhotoSubject,
  slot: PhotoSlot,
): string | null {
  if (slot === 2) return profile.photo2Url ?? null;
  if (slot === 3) return profile.photo3Url ?? null;
  return profile.profilePhotoUrl;
}

/** W2.3 — avatar picker + three-step signed upload. */
export function PhotoUploader({ profile }: { profile: InstructorProfile }) {
  const upload = useUploadAvatar();
  return <PhotoPicker profile={profile} upload={upload} />;
}

export function MorePhotos({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3 border-t border-grey/40 pt-4">
      <h3 className="text-base">{t.profile.morePhotos}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function MyPhotoSlot({
  profile,
  slot,
}: {
  profile: InstructorProfile;
  slot: ExtraPhotoSlot;
}) {
  const upload = useUploadPhoto(slot);
  const remove = useRemovePhoto(slot);
  return (
    <PhotoPicker
      profile={profile}
      slot={slot}
      upload={upload}
      remove={{
        onRemove: () => remove.mutate(),
        isPending: remove.isPending,
        isError: remove.isError,
      }}
    />
  );
}

export function MorePhotosUploader({ profile }: { profile: InstructorProfile }) {
  return (
    <MorePhotos>
      {EXTRA_PHOTO_SLOTS.map((slot) => (
        <MyPhotoSlot key={slot} profile={profile} slot={slot} />
      ))}
    </MorePhotos>
  );
}

export function PhotoPicker({
  profile,
  upload,
  remove,
  slot = 1,
}: {
  profile: PhotoSubject;
  upload: UseMutationResult<InstructorProfile, Error, File>;
  remove?: { onRemove: () => void; isPending: boolean; isError?: boolean };
  slot?: PhotoSlot;
}) {
  const t = useT();
  const url = photoUrlForSlot(profile, slot);
  const slotLabel =
    slot === 2 ? t.profile.photo2 : slot === 3 ? t.profile.photo3 : null;
  const uploadLabel = slotLabel
    ? url
      ? t.profile.slotReplacePhoto
      : t.profile.slotUploadPhoto
    : t.profile.uploadPhoto;
  const removeLabel = slotLabel ? t.profile.slotRemovePhoto : t.profile.removePhoto;
  const { locale } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const name = localizeField(
    profile.displayNameEn,
    profile.displayNameZh,
    locale,
  );

  function pick(file?: File) {
    if (!file) return;
    const err = validateAvatarType(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    upload.mutate(file);
  }

  return (
    <div
      className="flex items-center gap-4"
      role={slotLabel ? 'group' : undefined}
      aria-label={slotLabel ?? undefined}
    >
      {url ? (
        <img
          data-private
          src={url}
          alt={slotLabel ? `${name} — ${slotLabel}` : name}
          className="h-16 w-16 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-sunken text-slate">
          —
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {slotLabel && (
          <span className="text-sm font-medium text-navy">{slotLabel}</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? t.profile.uploading : uploadLabel}
        </Button>
        {remove && url && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={remove.isPending}
            onClick={remove.onRemove}
          >
            {removeLabel}
          </Button>
        )}
        {remove?.isError && (
          <Banner tone="error">
            <span className="text-xs">{t.errors.generic}</span>
          </Banner>
        )}
        <span className="text-xs text-slate">{t.profile.photoHint}</span>
        {error && (
          <Banner tone="error">
            <span className="text-xs">{error}</span>
          </Banner>
        )}
        {upload.isError && (
          <Banner tone="error">
            <span className="text-xs">
              {(upload.error as Error).message || t.errors.generic}
            </span>
          </Banner>
        )}
      </div>
    </div>
  );
}
