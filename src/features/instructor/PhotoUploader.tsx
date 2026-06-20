import { useRef, useState } from 'react';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { Banner, Button } from '@/components';
import { useUploadAvatar, validateAvatar } from './api';
import type { InstructorProfile } from '@/lib/types';

/** W2.3 — avatar picker + three-step signed upload. */
export function PhotoUploader({ profile }: { profile: InstructorProfile }) {
  const t = useT();
  const { locale } = useLocale();
  const upload = useUploadAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const name = localizeField(
    profile.displayNameEn,
    profile.displayNameZh,
    locale,
  );

  function pick(file?: File) {
    if (!file) return;
    const err = validateAvatar(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    upload.mutate(file);
  }

  return (
    <div className="flex items-center gap-4">
      {profile.profilePhotoUrl ? (
        <img
          src={profile.profilePhotoUrl}
          alt={name}
          className="h-16 w-16 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-sunken text-slate">
          —
        </div>
      )}
      <div className="flex flex-col gap-1.5">
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
          {upload.isPending ? t.profile.uploading : t.profile.uploadPhoto}
        </Button>
        <span className="text-xs text-slate">{t.profile.photoHint}</span>
        {error && (
          <Banner tone="error">
            <span className="text-xs">{error}</span>
          </Banner>
        )}
      </div>
    </div>
  );
}
