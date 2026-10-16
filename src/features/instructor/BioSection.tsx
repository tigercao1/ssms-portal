import { useCallback, useState } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Modal, Spinner, Textarea } from '@/components';
import {
  MachineTranslationNote,
  TranslatedByBadge,
} from '@/features/translation/TranslatedByBadge';
import { formatDateTime } from '@/lib/date';
import type {
  BioAiUsage,
  BioDraft,
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
const LOCKED_TEXTAREA = 'disabled:cursor-not-allowed disabled:opacity-60';

type Lang = 'en' | 'zh';
const LANGS: Lang[] = ['en', 'zh'];
type Messages = ReturnType<typeof useT>;

interface DraftRequest {
  text: string;
  mode: BioDraftMode;
  /** Set when the source language is known up front (Update translation). */
  source?: Lang;
}

/** Languages the instructor wrote; only the other side can be machine-translated. */
export function writtenLangs(request: DraftRequest, draft?: BioDraft): Lang[] {
  if (request.source) return [request.source];
  return (draft?.sourceLangs ?? []).map((l) => (l === 'zh-CN' ? 'zh' : 'en'));
}

function bioOf(p: InstructorProfile, lang: Lang): string {
  return (lang === 'en' ? p.bioEn : p.bioZh) ?? '';
}

function machineOf(p: InstructorProfile, lang: Lang): boolean {
  return Boolean(
    lang === 'en' ? p.bioEnMachineTranslated : p.bioZhMachineTranslated,
  );
}

function otherLang(lang: Lang): Lang {
  return lang === 'en' ? 'zh' : 'en';
}

function bioField(
  lang: Lang,
  text: string,
  machine: boolean,
): UpdateProfileBody {
  const value = text.trim() ? text : null;
  return lang === 'en'
    ? { bioEn: value, bioEnMachineTranslated: machine }
    : { bioZh: value, bioZhMachineTranslated: machine };
}

function useSaveLock() {
  const [holders, setHolders] = useState(0);
  const hold = useCallback(async <T,>(work: () => Promise<T>) => {
    setHolders((n) => n + 1);
    try {
      return await work();
    } finally {
      setHolders((n) => n - 1);
    }
  }, []);
  return { locked: holders > 0, hold };
}

type SaveLock = ReturnType<typeof useSaveLock>;

function useSaveBio() {
  const save = useUpdateProfile();
  const translate = useBioDraft();

  async function translateFrom(source: Lang, text: string): Promise<string> {
    const missing = otherLang(source);
    return translate.mutateAsync({ text, mode: 'translate' }).then(
      (d) => d[missing],
      () => '',
    );
  }

  async function saveBio(
    values: Record<Lang, string>,
    machine: Record<Lang, boolean> = { en: false, zh: false },
  ): Promise<Lang | null> {
    const [source, ...rest] = LANGS.filter((lang) => values[lang].trim());
    if (!source || rest.length > 0) {
      await save.mutateAsync({
        ...bioField('en', values.en, machine.en),
        ...bioField('zh', values.zh, machine.zh),
      });
      return null;
    }
    const missing = otherLang(source);
    const translation = await translateFrom(source, values[source]);
    await save.mutateAsync({
      ...bioField(source, values[source], machine[source]),
      ...(translation.trim() ? bioField(missing, translation, true) : {}),
    });
    return translation.trim() ? null : missing;
  }

  return {
    saveBio,
    translateFrom,
    save,
    pending: save.isPending || translate.isPending,
  };
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
  disabled = false,
  onEdit,
}: {
  title: string;
  text: string;
  editLabel: string;
  disabled?: boolean;
  onEdit: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-navy">{title}</span>
      <div
        onClick={disabled ? undefined : onEdit}
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
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute right-1.5 top-1.5 rounded-md p-1.5 text-slate hover:bg-navy-tint hover:text-navy disabled:cursor-not-allowed disabled:opacity-50"
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
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={`${value.length}/${MAX_BIO}`}>
      {(p) => (
        <Textarea
          {...p}
          rows={5}
          autoFocus
          disabled={disabled}
          className={LOCKED_TEXTAREA}
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
  lock,
  onBack,
  onSaved,
}: {
  request: DraftRequest;
  draft: ReturnType<typeof useBioDraft>;
  usage: BioAiUsage | undefined;
  lock: SaveLock;
  onBack: () => void;
  onSaved: (untranslated: Lang | null) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { saveBio, save, pending } = useSaveBio();
  const [edits, setEdits] = useState<Partial<Record<Lang, string>>>({});
  const [editing, setEditing] = useState<Record<Lang, boolean>>({
    en: false,
    zh: false,
  });
  const result = draft.data;
  const valueOf = (lang: Lang) => edits[lang] ?? result?.[lang] ?? '';
  const written = writtenLangs(request, result);
  const machine = (lang: Lang) =>
    written.length > 0 &&
    !written.includes(lang) &&
    valueOf(lang) === (result?.[lang] ?? '') &&
    Boolean(valueOf(lang).trim());

  async function onSave() {
    await lock.hold(async () =>
      onSaved(
        await saveBio(
          { en: valueOf('en'), zh: valueOf('zh') },
          { en: machine('en'), zh: machine('zh') },
        ),
      ),
    );
  }

  const error = draft.isError ? bioDraftError(draft.error) : null;
  const close = () => {
    if (!lock.locked) onBack();
  };

  return (
    <Modal
      title={t.bio.modalTitle}
      onClose={close}
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={lock.locked}
            onClick={close}
          >
            {t.common.back}
          </Button>
          {result && (
            <Button
              type="button"
              disabled={lock.locked}
              loading={pending}
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
                    disabled={lock.locked}
                    onChange={(v) => setEdits((e) => ({ ...e, [lang]: v }))}
                  />
                ) : (
                  <BioCard
                    title={titleOf(t, lang)}
                    text={valueOf(lang)}
                    editLabel={editLabelOf(t, lang)}
                    disabled={lock.locked}
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

/** Saved bio in one language, edited in place; an empty other side is machine-translated. */
function SavedBioCard({
  lang,
  profile,
  stale,
  usage,
  lock,
  onUpdateTranslation,
  onSaved,
}: {
  lang: Lang;
  profile: InstructorProfile;
  stale: boolean;
  usage: BioAiUsage | undefined;
  lock: SaveLock;
  onUpdateTranslation: () => void;
  onSaved: (untranslated: Lang | null) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { saveBio, translateFrom, save, pending } = useSaveBio();
  const [value, setValue] = useState<string | null>(null);
  const [notCleared, setNotCleared] = useState(false);
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

  async function saveEdit() {
    if (value === null) return;
    const other = otherLang(lang);
    const otherSaved = bioOf(profile, other);
    setNotCleared(false);
    if (!value.trim() && otherSaved.trim()) {
      const translation = await translateFrom(other, otherSaved);
      if (!translation.trim()) {
        setNotCleared(true);
        return;
      }
      await save.mutateAsync({
        ...bioField(other, otherSaved, machineOf(profile, other)),
        ...bioField(lang, translation, true),
      });
      onSaved(null);
    } else if (value.trim() && !otherSaved.trim()) {
      const values = { [lang]: value, [other]: '' } as Record<Lang, string>;
      onSaved(await saveBio(values));
    } else {
      await save.mutateAsync(bioField(lang, value, false));
      onSaved(null);
    }
    setValue(null);
  }

  const onSave = () => lock.hold(saveEdit);

  return (
    <div className="flex flex-col gap-2">
      {value === null ? (
        <BioCard
          title={titleOf(t, lang)}
          text={saved}
          editLabel={editLabelOf(t, lang)}
          disabled={lock.locked}
          onEdit={() => setValue(saved)}
        />
      ) : (
        <>
          <BioTextarea
            label={titleOf(t, lang)}
            value={value}
            disabled={lock.locked}
            onChange={(v) => {
              setValue(v);
              setNotCleared(false);
            }}
          />
          {notCleared && <Banner tone="pending">{t.bio.notCleared}</Banner>}
          {save.isError && <Banner tone="error">{t.errors.generic}</Banner>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={lock.locked}
              onClick={() => {
                setValue(null);
                setNotCleared(false);
                save.reset();
              }}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={lock.locked}
              loading={pending}
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
              disabled={exhausted || lock.locked}
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

/** Instructor bio in both languages; an empty one is machine-translated on save. */
export function BioSection({ profile }: { profile: InstructorProfile }) {
  const t = useT();
  const { locale } = useLocale();
  const usage = useBioAiUsage();
  const draft = useBioDraft();
  const { saveBio, save, pending } = useSaveBio();
  const lock = useSaveLock();
  const hasBio = Boolean(profile.bioEn?.trim() || profile.bioZh?.trim());
  const [composing, setComposing] = useState(false);
  const [texts, setTexts] = useState<Record<Lang, string>>({ en: '', zh: '' });
  const [request, setRequest] = useState<DraftRequest | null>(null);
  const [untranslated, setUntranslated] = useState<Lang | null>(null);
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

  function finish(missing: Lang | null) {
    setUntranslated(missing);
    setComposing(false);
    setTexts({ en: '', zh: '' });
  }

  function startRewrite() {
    const preferred: Lang = profile.preferredLanguage === 'zh-CN' ? 'zh' : 'en';
    const lang = bioOf(profile, preferred) ? preferred : otherLang(preferred);
    setTexts({ en: '', zh: '', [lang]: bioOf(profile, lang) });
    save.reset();
    setComposing(true);
  }

  async function onSave() {
    await lock.hold(async () => finish(await saveBio(texts)));
  }

  const showComposer = !hasBio || composing;
  const refineText = LANGS.map((lang) => texts[lang].trim())
    .filter(Boolean)
    .join('\n\n');
  const canAsk =
    Boolean(refineText) && refineText.length <= MAX_BIO_SOURCE && !exhausted;

  return (
    <div className="flex flex-col gap-4">
      {untranslated && <Banner tone="pending">{t.bio.notTranslated}</Banner>}

      {hasBio && (
        <div className="grid gap-4 md:grid-cols-2">
          {LANGS.map((lang) => (
            <SavedBioCard
              key={lang}
              lang={lang}
              profile={profile}
              stale={stale === lang}
              usage={usage.data}
              lock={lock}
              onSaved={setUntranslated}
              onUpdateTranslation={() => {
                const source = otherLang(lang);
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
            disabled={lock.locked}
            onClick={startRewrite}
          >
            {t.bio.rewrite}
          </Button>
        </div>
      )}

      {showComposer && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-slate">{t.bio.composeHint}</p>
            {hasBio && (
              <button
                type="button"
                disabled={lock.locked}
                onClick={() => setTexts({ en: '', zh: '' })}
                className="text-sm font-medium text-navy underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.bio.clear}
              </button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {LANGS.map((lang) => (
              <Field
                key={lang}
                label={titleOf(t, lang)}
                hint={`${texts[lang].length}/${MAX_BIO}`}
              >
                {(p) => (
                  <Textarea
                    {...p}
                    rows={6}
                    disabled={lock.locked}
                    className={LOCKED_TEXTAREA}
                    maxLength={MAX_BIO}
                    value={texts[lang]}
                    onChange={(e) =>
                      setTexts((v) => ({ ...v, [lang]: e.target.value }))
                    }
                  />
                )}
              </Field>
            ))}
          </div>
          {save.isError && <Banner tone="error">{t.errors.generic}</Banner>}
          <p className="text-xs text-slate">{t.bio.actionsHint}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="button"
              disabled={!refineText || lock.locked}
              loading={pending}
              onClick={() => void onSave().catch(() => undefined)}
            >
              {t.common.save}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!canAsk || lock.locked}
              onClick={() => start({ text: refineText, mode: 'refine' })}
            >
              {t.bio.refine}
            </Button>
            <UsageCount usage={usage.data} />
            {hasBio && (
              <Button
                type="button"
                variant="ghost"
                className="ml-auto"
                disabled={lock.locked}
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
          lock={lock}
          onBack={closeModal}
          onSaved={(missing) => {
            closeModal();
            finish(missing);
          }}
        />
      )}
    </div>
  );
}
