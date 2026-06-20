import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '@/i18n/core/I18nProvider';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Spinner,
  Textarea,
} from '@/components';
import {
  useCourseLevels,
  useLanguages,
  useTeachingLocations,
} from '@/features/reference/api';
import { useMyProfile, useUpdateProfile } from './api';
import { PhotoUploader } from './PhotoUploader';
import { MultiSelectChips } from './MultiSelectChips';
import { CertEditor, TrainerEditor } from './CertEditor';
import type {
  InstructorProfile,
  RefItem,
  UpdateProfileBody,
} from '@/lib/types';

const MAX_NAME = 100;
const MAX_BIO = 1000;

interface ProfileDraft {
  displayNameEn: string;
  displayNameZh: string;
  bioEn: string;
  bioZh: string;
  dateOfBirth: string;
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

/** W2.2 — instructor self profile edit form. */
export function EditProfilePage() {
  const t = useT();
  const navigate = useNavigate();
  const { data: profile, isLoading } = useMyProfile();
  const update = useUpdateProfile();
  const locations = useTeachingLocations();
  const langs = useLanguages();
  const levels = useCourseLevels();

  if (isLoading || !profile)
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );

  return <Form profile={profile} navigate={navigate} update={update}
    t={t} locations={locations.data ?? []} langs={langs.data ?? []}
    levels={levels.data ?? []} />;
}

function Form({
  profile,
  navigate,
  update,
  t,
  locations,
  langs,
  levels,
}: {
  profile: InstructorProfile;
  navigate: ReturnType<typeof useNavigate>;
  update: ReturnType<typeof useUpdateProfile>;
  t: ReturnType<typeof useT>;
  locations: RefItem[];
  langs: RefItem[];
  levels: RefItem[];
}) {
  const initial = useMemo(() => toDraft(profile), [profile]);
  const [draft, setDraft] = useState(initial);
  const [nameError, setNameError] = useState<string | null>(null);

  function set<K extends keyof typeof draft>(key: K, val: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.displayNameEn.trim()) {
      setNameError(t.validation.required);
      return;
    }
    const body: UpdateProfileBody = {
      ...draft,
      displayNameZh: draft.displayNameZh || null,
      bioEn: draft.bioEn || null,
      bioZh: draft.bioZh || null,
      dateOfBirth: draft.dateOfBirth || null,
    };
    await update.mutateAsync(body);
    navigate('/profile');
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 pb-24">
      <h1 className="text-3xl">{t.profile.editTitle}</h1>
      {update.isError && <Banner tone="error">{t.errors.generic}</Banner>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg">{t.profile.identitySection}</h2>
        <PhotoUploader profile={profile} />
        <Field label={t.profile.displayNameEn} required error={nameError ?? undefined}>
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
        <p className="text-xs text-slate">{t.profile.emailReadonly}</p>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg">{t.profile.bioSection}</h2>
        <p className="text-xs text-slate">{t.profile.aiFillHint}</p>
        <Field label={t.profile.bioEn} hint={`${draft.bioEn.length}/${MAX_BIO}`}>
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
        <Field label={t.profile.bioZh} hint={`${draft.bioZh.length}/${MAX_BIO}`}>
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
      </Card>

      <Card className="flex flex-col gap-5">
        <h2 className="text-lg">{t.profile.teachingSection}</h2>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">{t.profile.locations}</span>
          <MultiSelectChips
            options={locations}
            selected={draft.teachingLocationIds}
            onChange={(ids) => set('teachingLocationIds', ids)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">{t.profile.languages}</span>
          <MultiSelectChips
            options={langs}
            selected={draft.languageIds}
            onChange={(ids) => set('languageIds', ids)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">{t.profile.courseLevels}</span>
          <MultiSelectChips
            options={levels}
            selected={draft.courseLevelOfferedIds}
            onChange={(ids) => set('courseLevelOfferedIds', ids)}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <h2 className="text-lg">{t.profile.certsSection}</h2>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">{t.profile.certifications}</span>
          <CertEditor
            value={draft.certifications}
            onChange={(v) => set('certifications', v)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-navy">{t.profile.trainerStatus}</span>
          <TrainerEditor
            value={draft.trainerStatus}
            onChange={(v) => set('trainerStatus', v)}
          />
        </div>
      </Card>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-grey/60 bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate('/profile')}
          >
            {t.common.cancel}
          </Button>
          <Button type="submit" loading={update.isPending}>
            {t.profile.saveChanges}
          </Button>
        </div>
      </div>

    </form>
  );
}
