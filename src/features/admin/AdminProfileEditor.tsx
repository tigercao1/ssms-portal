import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components';
import {
  useCourseLevels,
  useLanguages,
  useTeachingLocations,
} from '@/features/reference/api';
import { MultiSelectChips } from '@/features/instructor/MultiSelectChips';
import { CertEditor, TrainerEditor } from '@/features/instructor/CertEditor';
import { PhotoPicker } from '@/features/instructor/PhotoUploader';
import { useAdminUpdateProfile, useAdminUploadPhoto } from './api';
import type {
  InstructorProfile,
  PreferredLanguage,
  UpdateProfileBody,
} from '@/lib/types';

const MAX_NAME = 100;
const MAX_BIO = 1000;
const MIN_STUDENT_AGE = 0;
const MAX_STUDENT_AGE = 18;
const DEFAULT_MIN_STUDENT_AGE = 5;

interface ProfileDraft {
  displayNameEn: string;
  displayNameZh: string;
  bioEn: string;
  bioZh: string;
  dateOfBirth: string;
  preferredLanguage: PreferredLanguage;
  minStudentAge: string;
  teachingLocationIds: string[];
  languageIds: string[];
  courseLevelOfferedIds: string[];
  certifications: NonNullable<UpdateProfileBody['certifications']>;
  trainerStatus: NonNullable<UpdateProfileBody['trainerStatus']>;
}

function toDraft(p: InstructorProfile): ProfileDraft {
  return {
    displayNameEn: p.displayNameEn,
    displayNameZh: p.displayNameZh ?? '',
    bioEn: p.bioEn ?? '',
    bioZh: p.bioZh ?? '',
    dateOfBirth: p.dateOfBirth ?? '',
    preferredLanguage: p.preferredLanguage,
    minStudentAge: String(p.minStudentAge ?? DEFAULT_MIN_STUDENT_AGE),
    teachingLocationIds: p.teachingLocations.map((r) => r.id),
    languageIds: p.languages.map((r) => r.id),
    courseLevelOfferedIds: p.courseLevelsOffered.map((r) => r.id),
    certifications: p.certifications.map((c) => ({
      org: c.org,
      track: c.track,
      level: c.level,
      isPartial: c.isPartial,
      partialComponents: c.partialComponents,
      achievedOn: c.achievedOn,
    })),
    trainerStatus: p.trainerStatus.map((tr) => ({
      discipline: tr.discipline,
      rookieSessionCompleted: tr.rookieSessionCompleted,
      trainerExamPassed: tr.trainerExamPassed,
      trainerLevel: tr.trainerLevel,
    })),
  };
}

function minStudentAgeError(
  value: string,
  t: ReturnType<typeof useT>,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return t.validation.required;
  const age = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || age < MIN_STUDENT_AGE || age > MAX_STUDENT_AGE)
    return t.profile.minStudentAgeRange;
  return null;
}

export function AdminProfileEditor({
  instructorId,
  profile,
}: {
  instructorId: string;
  profile: InstructorProfile;
}) {
  const t = useT();
  const update = useAdminUpdateProfile(instructorId);
  const upload = useAdminUploadPhoto(instructorId);
  const removePhoto = useAdminUpdateProfile(instructorId);
  const locations = useTeachingLocations();
  const langs = useLanguages();
  const levels = useCourseLevels();
  const [draft, setDraft] = useState(() => toDraft(profile));
  const [nameError, setNameError] = useState<string | null>(null);
  const [ageError, setAgeError] = useState<string | null>(null);

  function set<K extends keyof ProfileDraft>(key: K, val: ProfileDraft[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nextNameError = draft.displayNameEn.trim()
      ? null
      : t.validation.required;
    const nextAgeError = minStudentAgeError(draft.minStudentAge, t);
    setNameError(nextNameError);
    setAgeError(nextAgeError);
    if (nextNameError || nextAgeError) return;
    update.mutate({
      ...draft,
      displayNameZh: draft.displayNameZh || null,
      bioEn: draft.bioEn || null,
      bioZh: draft.bioZh || null,
      dateOfBirth: draft.dateOfBirth || null,
      minStudentAge: Number(draft.minStudentAge),
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg">{t.profile.identitySection}</h2>
        <PhotoPicker
          profile={profile}
          upload={upload}
          remove={{
            onRemove: () => removePhoto.mutate({ profilePhotoUrl: null }),
            isPending: removePhoto.isPending,
          }}
        />
        {removePhoto.isError && (
          <Banner tone="error">{t.errors.generic}</Banner>
        )}
        <Field
          label={t.profile.displayNameEn}
          required
          error={nameError ?? undefined}
        >
          {(p) => (
            <Input
              {...p}
              maxLength={MAX_NAME}
              value={draft.displayNameEn}
              onChange={(e) => set('displayNameEn', e.target.value)}
            />
          )}
        </Field>
        <Field label={t.profile.displayNameZh}>
          {(p) => (
            <Input
              {...p}
              maxLength={MAX_NAME}
              value={draft.displayNameZh}
              onChange={(e) => set('displayNameZh', e.target.value)}
            />
          )}
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg">{t.profile.bioSection}</h2>
        <Field
          label={t.profile.bioEn}
          hint={`${draft.bioEn.length}/${MAX_BIO}`}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              maxLength={MAX_BIO}
              value={draft.bioEn}
              onChange={(e) => set('bioEn', e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t.profile.bioZh}
          hint={`${draft.bioZh.length}/${MAX_BIO}`}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              maxLength={MAX_BIO}
              value={draft.bioZh}
              onChange={(e) => set('bioZh', e.target.value)}
            />
          )}
        </Field>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-lg sm:col-span-2">{t.profile.detailsSection}</h2>
        <Field label={t.profile.dateOfBirth} hint={t.profile.dobHint}>
          {(p) => (
            <Input
              {...p}
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={draft.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
            />
          )}
        </Field>
        <Field label={t.settings.languageLabel}>
          {(p) => (
            <Select
              {...p}
              value={draft.preferredLanguage}
              onChange={(e) =>
                set('preferredLanguage', e.target.value as PreferredLanguage)
              }
            >
              <option value="en">{t.common.english}</option>
              <option value="zh-CN">{t.common.chinese}</option>
            </Select>
          )}
        </Field>
      </Card>

      <Card className="flex flex-col gap-5">
        <h2 className="text-lg">{t.profile.teachingSection}</h2>
        <div className="sm:max-w-xs">
          <Field
            label={t.profile.minStudentAge}
            required
            error={ageError ?? undefined}
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                required
                min={MIN_STUDENT_AGE}
                max={MAX_STUDENT_AGE}
                step={1}
                value={draft.minStudentAge}
                onChange={(e) => set('minStudentAge', e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">
            {t.profile.locations}
          </span>
          <MultiSelectChips
            options={locations.data ?? []}
            selected={draft.teachingLocationIds}
            onChange={(ids) => set('teachingLocationIds', ids)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">
            {t.profile.languages}
          </span>
          <MultiSelectChips
            options={langs.data ?? []}
            selected={draft.languageIds}
            onChange={(ids) => set('languageIds', ids)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">
            {t.profile.courseLevels}
          </span>
          <MultiSelectChips
            options={levels.data ?? []}
            selected={draft.courseLevelOfferedIds}
            onChange={(ids) => set('courseLevelOfferedIds', ids)}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <h2 className="text-lg">{t.profile.certsSection}</h2>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">
            {t.profile.certifications}
          </span>
          <CertEditor
            value={draft.certifications}
            onChange={(v) => set('certifications', v)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">
            {t.profile.trainerStatus}
          </span>
          <TrainerEditor
            value={draft.trainerStatus}
            onChange={(v) => set('trainerStatus', v)}
          />
        </div>
      </Card>

      {update.isError && <Banner tone="error">{t.errors.generic}</Banner>}
      {update.isSuccess && <Banner tone="approved">{t.common.saved}</Banner>}
      <div className="flex justify-end">
        <Button type="submit" loading={update.isPending}>
          {t.profile.saveChanges}
        </Button>
      </div>
    </form>
  );
}
