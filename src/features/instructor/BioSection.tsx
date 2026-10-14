import { useState } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Modal, Spinner, Textarea } from '@/components';
import {
  MachineTranslationNote,
  TranslatedByBadge,
} from '@/features/translation/TranslatedByBadge';
import { formatDateTime } from '@/lib/date';
import type {
  BioAiUsage,
  BioDraftMode,
  InstructorProfile,
  UpdateProfileBody,
} from '@/lib/types';
import {
  bioDraftError,
  useBioAiUsage,
  useBioDraft,
  useUpdateProfile,
} from './api';

export const MAX_BIO = 1000;
export const MAX_BIO_SOURCE = 2000;

type Lang = 'en' | 'zh';
const LANGS: Lang[] = ['en', 'zh'];
type Messages = ReturnType<typeof useT>;

interface DraftRequest {
  text: string;
  mode: BioDraftMode;
  /** The language the instructor wrote; the other side is the model's translation. */
  source: Lang;
}

/** Dominant script of the instructor's text: CJK characters vs Latin words. */
export function detectSourceLang(text: string): Lang {
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const words = text.match(/[A-Za-z]+/g)?.length ?? 0;
  return cjk > words ? 'zh' : 'en';
}

function bioOf(p: InstructorProfile, lang: Lang): string {
  return (lang === 'en' ? p.bioEn : p.bioZh) ?? '';
}

function time(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** A side is stale when the other language was saved later (null = oldest). */
export function staleSide(p: InstructorProfile): Lang | null {
  const en = time(p.bioEnUpdatedAt);
  const zh = time(p.bioZhUpdatedAt);
  const newer = (a: number | null, b: number | null) =>
    a !== null && (b === null || a > b);
  if (newer(zh, en) && bioOf(p, 'zh').trim()) return 'en';
  if (newer(en, zh) && bioOf(p, 'en').trim()) return 'zh';
  return null;
}

function limitMessage(t: Messages, usage: BioAiUsage, locale: 'en' | 'zh-CN') {
  const limit = String(usage.limit);
  if (!usage.resetsAt)
    return t.bio.limitReachedNoTime.replace('{limit}', limit);
  const [before, after] = t.bio.limitReached
    .replace('{limit}', limit)
    .split('{time}');
  return (
    <>
      {before}
      <span className="whitespace-nowrap">
        {formatDateTime(usage.resetsAt, locale)}
      </span>
      {after}
    </>
  );
}

function UsageCount({ usage }: { usage: BioAiUsage | undefined }) {
  const t = useT();
  if (!usage) return null;
  return (
    <span className="whitespace-nowrap text-sm text-slate">
      {t.bio.remaining
        .replace('{n}', String(usage.remaining))
        .replace('{limit}', String(usage.limit))}
    </span>
  );
}

function PenIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" />
    </svg>
  );
}

/** Read-only bio with a grey overlay; the card or its pen switches to editing. */
function BioCard({
  title,
  text,
  editLabel,
  onEdit,
}: {
  title: string;
  text: string;
  editLabel: string;
  onEdit: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-navy">{title}</span>
      <div
        onClick={onEdit}
        className="relative min-h-24 cursor-pointer rounded-md border border-grey bg-sunken px-3 py-2 pr-11"
      >
        <p className="whitespace-pre-wrap break-words text-ink">
          {text || <span className="text-slate">{t.bio.empty}</span>}
        </p>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md bg-[color-mix(in_srgb,var(--grey)_15%,transparent)]"
        />
        <button
          type="button"
          aria-label={editLabel}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute right-1.5 top-1.5 rounded-md p-1.5 text-slate hover:bg-navy-tint hover:text-navy"
        >
          <PenIcon />
        </button>
      </div>
    </div>
  );
}

function BioTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={`${value.length}/${MAX_BIO}`}>
      {(p) => (
        <Textarea
          {...p}
          rows={5}
          autoFocus
          maxLength={MAX_BIO}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function titleOf(t: Messages, lang: Lang) {
  return lang === 'en' ? t.bio.english : t.bio.chinese;
}

function editLabelOf(t: Messages, lang: Lang) {
  return lang === 'en' ? t.bio.editEn : t.bio.editZh;
}

/** Loading → review of both languages → one PATCH with both bios and flags. */
function BioDraftModal({
  request,
  draft,
  usage,
  onBack,
  onSaved,
}: {
  request: DraftRequest;
  draft: ReturnType<typeof useBioDraft>;
  usage: BioAiUsage | undefined;
  onBack: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const save = useUpdateProfile();
  const [edits, setEdits] = useState<Partial<Record<Lang, string>>>({});
  const [editing, setEditing] = useState<Record<Lang, boolean>>({
    en: false,
    zh: false,
  });
  const result = draft.data;
  const valueOf = (lang: Lang) => edits[lang] ?? result?.[lang] ?? '';
  const machine = (lang: Lang) =>
    lang !== request.source &&
    valueOf(lang) === (result?.[lang] ?? '') &&
    Boolean(valueOf(lang).trim());

  async function onSave() {
    const body: UpdateProfileBody = {
      bioEn: valueOf('en').trim() ? valueOf('en') : null,
      bioZh: valueOf('zh').trim() ? valueOf('zh') : null,
      bioEnMachineTranslated: machine('en'),
      bioZhMachineTranslated: machine('zh'),
    };
    await save.mutateAsync(body);
    onSaved();
  }

  const error = draft.isError ? bioDraftError(draft.error) : null;

  return (
    <Modal
      title={t.bio.modalTitle}
      onClose={onBack}
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onBack}>
            {t.common.back}
          </Button>
          {result && (
            <Button
              type="button"
              loading={save.isPending}
              onClick={() => void onSave().catch(() => undefined)}
            >
              {t.common.save}
            </Button>
          )}
        </>
      }
    >
      {draft.isPending && (
        <div className="flex flex-col items-center gap-3 py-12 text-slate">
          <Spinner className="h-7 w-7" />
          <p>
            {request.mode === 'refine' ? t.bio.refining : t.bio.translating}
          </p>
        </div>
      )}
      {error === 'limit' && (
        <Banner tone="error">
          {usage
            ? limitMessage(t, usage, locale)
            : t.bio.limitReachedNoTime.replace('{limit}', '5')}
        </Banner>
      )}
      {error === 'unavailable' && (
        <Banner tone="error">{t.bio.unavailable}</Banner>
      )}
      {error === 'generic' && <Banner tone="error">{t.errors.generic}</Banner>}
      {result && (
        <div className="flex flex-col gap-4">
          {save.isError && <Banner tone="error">{t.errors.generic}</Banner>}
          <p className="text-sm text-slate">{t.bio.reviewHint}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {LANGS.map((lang) => (
              <div key={lang} className="flex flex-col gap-2">
                {editing[lang] ? (
                  <BioTextarea
                    label={titleOf(t, lang)}
                    value={valueOf(lang)}
                    onChange={(v) => setEdits((e) => ({ ...e, [lang]: v }))}
                  />
                ) : (
                  <BioCard
                    title={titleOf(t, lang)}
                    text={valueOf(lang)}
                    editLabel={editLabelOf(t, lang)}
                    onEdit={() => setEditing((e) => ({ ...e, [lang]: true }))}
                  />
                )}
                {machine(lang) && <TranslatedByBadge model={result.model} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Saved bio in one language, edited in place; saving sends only this side. */
function SavedBioCard({
  lang,
  profile,
  stale,
  usage,
  onUpdateTranslation,
}: {
  lang: Lang;
  profile: InstructorProfile;
  stale: boolean;
  usage: BioAiUsage | undefined;
  onUpdateTranslation: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const save = useUpdateProfile();
  const [value, setValue] = useState<string | null>(null);
  const saved = bioOf(profile, lang);
  const machineModel =
    lang === 'en'
      ? profile.bioEnMachineTranslated
        ? profile.bioEnTranslatedBy
        : null
      : profile.bioZhMachineTranslated
        ? profile.bioZhTranslatedBy
        : null;
  const exhausted = usage?.remaining === 0;

  async function onSave() {
    if (value === null) return;
    const text = value.trim() ? value : null;
    const body: UpdateProfileBody =
      lang === 'en'
        ? { bioEn: text, bioEnMachineTranslated: false }
        : { bioZh: text, bioZhMachineTranslated: false };
    await save.mutateAsync(body);
    setValue(null);
  }

  return (
    <div className="flex flex-col gap-2">
      {value === null ? (
        <BioCard
          title={titleOf(t, lang)}
          text={saved}
          editLabel={editLabelOf(t, lang)}
          onEdit={() => setValue(saved)}
        />
      ) : (
        <>
          <BioTextarea
            label={titleOf(t, lang)}
            value={value}
            onChange={setValue}
          />
          {save.isError && <Banner tone="error">{t.errors.generic}</Banner>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setValue(null);
                save.reset();
              }}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={save.isPending}
              onClick={() => void onSave().catch(() => undefined)}
            >
              {t.common.save}
            </Button>
          </div>
        </>
      )}
      {value === null && <MachineTranslationNote model={machineModel} />}
      {stale && (
        <div className="flex flex-col gap-2 rounded-md border-l-[3px] border-l-status-pending bg-[color-mix(in_srgb,var(--status-pending)_10%,transparent)] px-3 py-2 text-sm">
          <p>
            <span className="font-semibold">{t.bio.stale}</span>{' '}
            <span className="text-slate">{t.bio.staleHint}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={exhausted}
              onClick={onUpdateTranslation}
            >
              {t.bio.updateTranslation}
            </Button>
            <UsageCount usage={usage} />
          </div>
          {exhausted && usage && (
            <p className="text-slate">{limitMessage(t, usage, locale)}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Instructor bio: write once, refine or translate with AI, review, save. */
export function BioSection({ profile }: { profile: InstructorProfile }) {
  const t = useT();
  const { locale } = useLocale();
  const usage = useBioAiUsage();
  const draft = useBioDraft();
  const hasBio = Boolean(profile.bioEn?.trim() || profile.bioZh?.trim());
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [request, setRequest] = useState<DraftRequest | null>(null);
  const exhausted = usage.data?.remaining === 0;
  const stale = hasBio ? staleSide(profile) : null;

  function start(next: DraftRequest) {
    setRequest(next);
    draft.mutate({ text: next.text, mode: next.mode });
  }

  function closeModal() {
    setRequest(null);
    draft.reset();
  }

  function startRewrite() {
    const preferred: Lang = profile.preferredLanguage === 'zh-CN' ? 'zh' : 'en';
    const other: Lang = preferred === 'en' ? 'zh' : 'en';
    setText(bioOf(profile, preferred) || bioOf(profile, other));
    setComposing(true);
  }

  const showComposer = !hasBio || composing;
  const canAsk = Boolean(text.trim()) && !exhausted;

  return (
    <div className="flex flex-col gap-4">
      {hasBio && (
        <div className="grid gap-4 md:grid-cols-2">
          {LANGS.map((lang) => (
            <SavedBioCard
              key={lang}
              lang={lang}
              profile={profile}
              stale={stale === lang}
              usage={usage.data}
              onUpdateTranslation={() => {
                const source: Lang = lang === 'en' ? 'zh' : 'en';
                start({
                  text: bioOf(profile, source),
                  mode: 'translate',
                  source,
                });
              }}
            />
          ))}
        </div>
      )}

      {hasBio && !composing && (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={startRewrite}
          >
            {t.bio.rewrite}
          </Button>
        </div>
      )}

      {showComposer && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate">{t.bio.composeHint}</p>
          <div className="relative">
            <Field
              label={t.bio.composeLabel}
              hint={`${text.length}/${MAX_BIO_SOURCE}`}
            >
              {(p) => (
                <Textarea
                  {...p}
                  rows={6}
                  maxLength={MAX_BIO_SOURCE}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              )}
            </Field>
            {hasBio && (
              <button
                type="button"
                onClick={() => setText('')}
                className="absolute right-0 top-0 text-sm font-medium text-navy underline-offset-2 hover:underline"
              >
                {t.bio.clear}
              </button>
            )}
          </div>
          <p className="text-xs text-slate">{t.bio.actionsHint}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!canAsk}
              onClick={() =>
                start({ text, mode: 'refine', source: detectSourceLang(text) })
              }
            >
              {t.bio.refine}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!canAsk}
              onClick={() =>
                start({
                  text,
                  mode: 'translate',
                  source: detectSourceLang(text),
                })
              }
            >
              {t.bio.useAsWritten}
            </Button>
            <UsageCount usage={usage.data} />
            {hasBio && (
              <Button
                type="button"
                variant="ghost"
                className="ml-auto"
                onClick={() => setComposing(false)}
              >
                {t.common.cancel}
              </Button>
            )}
          </div>
          {exhausted && usage.data && (
            <p className="text-sm text-slate">
              {limitMessage(t, usage.data, locale)}
            </p>
          )}
        </div>
      )}

      {request && (
        <BioDraftModal
          request={request}
          draft={draft}
          usage={usage.data}
          onBack={closeModal}
          onSaved={() => {
            closeModal();
            setComposing(false);
            setText('');
          }}
        />
      )}
    </div>
  );
}
