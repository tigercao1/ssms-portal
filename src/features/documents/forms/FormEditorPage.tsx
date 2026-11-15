import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useParams, useSearchParams } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Spinner,
  Textarea,
  Toggle,
} from '@/components';
import { CopyLinkButton } from '@/features/admin/PageParts';
import { Markdown } from '@/sign/Markdown';
import type { DocumentLanguage } from '../api';
import { useSourceRecovery, type SourceRecovery } from '../pdf/presignedSource';
import { Chip } from '../admin/badges';
import { errorText, languageName, templateTitle } from '../admin/format';
import {
  FORM_BODY_MAX,
  FORM_LANGUAGES,
  FORM_TITLE_MAX,
  baselineOf,
  isConflict,
  publicFormUrl,
  sameDraft,
  useDraftRevision,
  useForm,
  useFormWriting,
  usePublishForm,
  useReloadForm,
  useSaveFormDraft,
  useUpdateForm,
  type FormTemplate,
} from './api';
import { FieldList } from './FieldList';
import {
  fieldIssues,
  fieldsProblem,
  publishProblems,
  toEditor,
  toFormDraft,
  type DraftField,
  type DraftPlacement,
  type EditorDraft,
} from './formFields';
import { OriginalPdfSection } from './OriginalPdfSection';

export function FormEditorPage() {
  const { id = '' } = useParams();
  const t = useT();
  const form = useForm(id);
  const sourceRecovery = useSourceRecovery(form);
  if (form.isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7" />
      </div>
    );
  if (!form.data)
    return (
      <Banner tone="error">
        {t.signingForms.loadFailed.replace(
          '{reason}',
          errorText(form.error, t.errors.generic),
        )}
      </Banner>
    );
  return <Editor form={form.data} sourceRecovery={sourceRecovery} />;
}

function Editor({
  form,
  sourceRecovery,
}: {
  form: FormTemplate;
  sourceRecovery: SourceRecovery;
}) {
  const t = useT();
  const s = t.signingForms;
  const { locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const lang: DocumentLanguage = params.get('lang') === 'zh' ? 'zh' : 'en';
  const [dirty, setDirty] = useState(false);
  const title = templateTitle(form, locale);
  const url = publicFormUrl(form.slug);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );

  return (
    <div className="flex flex-col gap-5">
      {blocker.state === 'blocked' && (
        <Modal
          title={s.leaveTitle}
          onClose={() => blocker.reset()}
          footer={
            <>
              <Button variant="ghost" onClick={() => blocker.reset()}>
                {s.leaveStay}
              </Button>
              <Button variant="danger" onClick={() => blocker.proceed()}>
                {s.leaveDiscard}
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink">{s.leaveBody}</p>
        </Modal>
      )}
      <div className="flex flex-col gap-1">
        <Link
          to="/admin/signing-forms"
          className="text-sm text-navy hover:underline"
        >
          ← {s.back}
        </Link>
        <h1 className="text-2xl">{title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate">{s.publicLink}:</span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-navy hover:underline"
          >
            {url}
          </a>
          <CopyLinkButton
            url={url}
            ariaLabel={s.copyLinkFor.replace('{title}', title)}
          />
        </div>
      </div>

      <EmailCopySetting form={form} />

      <Banner tone="info">{s.legalNote}</Banner>

      <div
        role="tablist"
        aria-label={s.tabsLabel}
        className="flex gap-1 border-b border-grey/60"
      >
        {FORM_LANGUAGES.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            id={`form-tab-${l}`}
            aria-controls={`form-panel-${l}`}
            aria-selected={lang === l}
            onClick={() => setParams(l === 'en' ? {} : { lang: l })}
            className={cn(
              'min-h-11 border-b-2 px-4 text-sm transition-colors',
              lang === l
                ? 'border-red font-medium text-navy'
                : 'border-transparent text-slate hover:text-navy',
            )}
          >
            {languageName(l, t)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`form-panel-${lang}`}
        aria-labelledby={`form-tab-${lang}`}
      >
        <LanguageEditor
          key={lang}
          form={form}
          lang={lang}
          sourceRecovery={sourceRecovery}
          onDirtyChange={setDirty}
        />
      </div>
    </div>
  );
}

function EmailCopySetting({ form }: { form: FormTemplate }) {
  const t = useT();
  const s = t.signingForms;
  const update = useUpdateForm(form.id);
  const reload = useReloadForm(form.id);
  const [reloaded, setReloaded] = useState<{ mine: boolean | null } | null>(
    null,
  );
  const change = (emailCopy: boolean) => {
    setReloaded(null);
    update.mutate(
      { emailCopy, expectedUpdatedAt: form.updatedAt },
      {
        onError: (err) => {
          if (!isConflict(err)) return;
          void reload().then(
            (fresh) => {
              update.reset();
              setReloaded({
                mine: fresh.emailCopy === emailCopy ? null : emailCopy,
              });
            },
            () => undefined,
          );
        },
      },
    );
  };
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-ink">{s.emailCopy}</span>
        <Toggle
          checked={update.isPending ? !form.emailCopy : form.emailCopy}
          disabled={update.isPending}
          label={s.emailCopy}
          onChange={change}
        />
      </div>
      <p className="text-sm text-slate">{s.emailCopyHint}</p>
      {reloaded && (
        <Banner tone="pending">
          <div className="flex flex-col gap-2">
            <p>
              {s.conflictReloaded}
              {reloaded.mine !== null &&
                ` ${reloaded.mine ? s.emailCopyMineOn : s.emailCopyMineOff}`}
            </p>
            {reloaded.mine !== null && (
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => change(reloaded.mine ?? form.emailCopy)}
                >
                  {s.emailCopyApply}
                </Button>
              </div>
            )}
          </div>
        </Banner>
      )}
      {update.isError && (
        <p role="alert" className="text-sm text-status-rejected">
          {s.emailCopyFailed.replace(
            '{reason}',
            errorText(update.error, t.errors.generic),
          )}
        </p>
      )}
    </Card>
  );
}

function LanguageEditor({
  form,
  lang,
  sourceRecovery,
  onDirtyChange,
}: {
  form: FormTemplate;
  lang: DocumentLanguage;
  sourceRecovery: SourceRecovery;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useT();
  const s = t.signingForms;
  const { draft, published } = form.languages[lang];
  const baseline = baselineOf(form, lang);
  const [values, setValues] = useState<EditorDraft>(() => toEditor(baseline));
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [{ updatedAt: revision }, setRevision] = useDraftRevision(form, lang);
  const [reloaded, setReloaded] = useState<{ mine: EditorDraft | null } | null>(
    null,
  );
  const latest = useRef(values);
  latest.current = values;
  const latestBaseline = useRef(baseline);
  latestBaseline.current = baseline;
  const save = useSaveFormDraft(form.id, lang);
  const publish = usePublishForm(form.id, lang);
  const reload = useReloadForm(form.id);
  const writing = useFormWriting(form.id, lang);
  const current = toFormDraft(values);
  const dirty = !sameDraft(current, baseline);
  const textDirty = useRef(false);
  textDirty.current = dirty;
  const unsaved = dirty || !!reloaded?.mine;
  const issues = fieldIssues(values.fields, t);
  const problem = fieldsProblem(values.fields, t);
  const incomplete = !values.title.trim();
  const hasPdf = !!(draft ?? published)?.originalPdf;
  const publishBlocked = dirty
    ? s.publishUnsaved
    : !draft
      ? s.publishNeedsDraft
      : publishProblems(draft, t).join(' ') || null;

  useEffect(() => {
    onDirtyChange(unsaved);
  }, [unsaved, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);

  const edit = (patch: Partial<EditorDraft>) => {
    setValues((v) => ({ ...v, ...patch }));
    if (!publish.isPending) publish.reset();
  };

  const editFields = (fields: DraftField[], placements: DraftPlacement[]) =>
    edit({ fields, placements });

  const showFresh = (fresh: FormTemplate) => {
    save.reset();
    publish.reset();
    setRevision(fresh);
    setValues(toEditor(baselineOf(fresh, lang)));
  };

  const reloadAfterConflict = (keepMine: (mine: EditorDraft) => boolean) =>
    reload().then(
      (fresh) => {
        const mine = latest.current;
        showFresh(fresh);
        setReloaded({ mine: keepMine(mine) ? mine : null });
      },
      () => undefined,
    );

  const adoptPdfWrite = (next: FormTemplate) => {
    const mine = latest.current;
    const before = latestBaseline.current;
    showFresh(next);
    if (!sameDraft(toFormDraft(mine), before)) setReloaded({ mine });
  };

  const saveDraft = (onDone?: (saved: boolean) => void) => {
    const sent = values;
    const body = toFormDraft(sent);
    publish.reset();
    setReloaded(null);
    save.mutate(
      {
        ...body,
        title: body.title.trim(),
        fields: body.fields.map((f) => ({ ...f, label: f.label.trim() })),
        expectedUpdatedAt: revision,
      },
      {
        onSuccess: (next) => {
          const fresh = baselineOf(next, lang);
          setValues((v) =>
            v === sent && !sameDraft(toFormDraft(v), fresh)
              ? toEditor(fresh)
              : v,
          );
          onDone?.(true);
        },
        onError: (err) => {
          if (isConflict(err)) void reloadAfterConflict(() => true);
          onDone?.(false);
        },
      },
    );
  };

  const ensureDraft = () =>
    new Promise<boolean>((resolve) => {
      if (problem !== null || incomplete) resolve(false);
      else saveDraft(resolve);
    });

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {published && (
          <Chip
            tone="approved"
            label={s.statusPublished.replace('{n}', String(published.version))}
          />
        )}
        {draft && (
          <Chip
            tone="pending"
            label={s.statusDraft.replace('{n}', String(draft.version))}
          />
        )}
        {!draft && !published && <Chip tone="neutral" label={s.statusNone} />}
        {dirty && (
          <span className="text-xs font-medium text-status-pending">
            {s.unsaved}
          </span>
        )}
      </div>

      {!draft && published && <Banner tone="info">{s.fromPublished}</Banner>}

      <Card className="flex flex-col gap-4">
        <Field label={s.versionTitle} required>
          {(p) => (
            <Input
              {...p}
              value={values.title}
              maxLength={FORM_TITLE_MAX}
              onChange={(e) => edit({ title: e.target.value })}
            />
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-navy">{s.body}</span>
            <div
              role="group"
              aria-label={s.bodyModes}
              className="inline-flex overflow-hidden rounded-md border border-grey text-xs"
            >
              {(['write', 'preview'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'px-2.5 py-1 font-medium',
                    mode === m
                      ? 'bg-navy text-white'
                      : 'bg-surface text-slate hover:bg-navy-tint',
                  )}
                >
                  {m === 'write' ? s.write : s.preview}
                </button>
              ))}
            </div>
          </div>
          {mode === 'write' ? (
            <>
              <Textarea
                aria-label={s.body}
                value={values.bodyMarkdown}
                maxLength={FORM_BODY_MAX}
                rows={16}
                className="font-mono text-sm"
                onChange={(e) => edit({ bodyMarkdown: e.target.value })}
              />
              <p className="text-sm text-slate">{s.bodyHint}</p>
            </>
          ) : (
            <div
              data-testid="body-preview"
              className="min-h-40 rounded-md border border-grey/60 bg-surface p-4"
            >
              {values.bodyMarkdown.trim() ? (
                <Markdown source={values.bodyMarkdown} />
              ) : (
                <p className="text-sm text-slate">{s.previewEmpty}</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg">{s.fields}</h2>
          <p className="text-sm text-slate">{s.fieldsHint}</p>
        </div>
        <FieldList
          fields={values.fields}
          placements={values.placements}
          hasPdf={hasPdf}
          lang={lang}
          issues={issues}
          onChange={editFields}
        />
        {problem && (
          <p role="alert" className="text-sm text-status-rejected">
            {problem}
          </p>
        )}
      </Card>

      <OriginalPdfSection
        form={form}
        lang={lang}
        sourceRecovery={sourceRecovery}
        writing={writing}
        unsaved={unsaved}
        fields={values.fields}
        placements={values.placements}
        issues={issues}
        onChange={editFields}
        onEnsureDraft={ensureDraft}
        onConflict={() => void reloadAfterConflict(() => textDirty.current)}
        onWritten={adoptPdfWrite}
      />

      {reloaded && (
        <Banner tone="pending">
          <div className="flex flex-col gap-2">
            <p>
              {s.conflictReloaded}
              {reloaded.mine && ` ${s.conflictMineKept}`}
            </p>
            {reloaded.mine && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setValues(reloaded.mine ?? toEditor(baseline));
                    setReloaded(null);
                  }}
                >
                  {s.conflictPutBack}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReloaded(null)}
                >
                  {s.conflictDismiss}
                </Button>
              </div>
            )}
          </div>
        </Banner>
      )}
      {save.isError && (
        <Banner tone="error">
          {s.saveFailed.replace(
            '{reason}',
            errorText(save.error, t.errors.generic),
          )}
        </Banner>
      )}
      {save.isSuccess && !dirty && draft && (
        <Banner tone="approved">
          {s.saved.replace('{n}', String(draft.version))}
        </Banner>
      )}
      {publish.isError && (
        <Banner tone="error">
          {s.publishFailed.replace(
            '{reason}',
            errorText(publish.error, t.errors.generic),
          )}
        </Banner>
      )}
      {publish.isSuccess && published && (
        <Banner tone="approved">
          {s.published
            .replace('{n}', String(published.version))
            .replace('{lang}', languageName(lang, t))}
        </Banner>
      )}

      <div className="sticky bottom-0 z-30 -mx-1 flex flex-wrap items-center gap-3 border-t border-grey/60 bg-canvas px-1 py-3">
        <Button
          loading={save.isPending}
          disabled={!dirty || incomplete || problem !== null || writing}
          onClick={() => saveDraft()}
        >
          {s.saveDraft}
        </Button>
        <Button
          variant="secondary"
          loading={publish.isPending}
          disabled={publishBlocked !== null || writing}
          onClick={() => {
            const sent = current;
            save.reset();
            setReloaded(null);
            if (revision === null) {
              void reloadAfterConflict(() => false);
              return;
            }
            publish.mutate(revision, {
              onError: (err) => {
                if (isConflict(err))
                  void reloadAfterConflict(
                    (mine) => !sameDraft(toFormDraft(mine), sent),
                  );
              },
            });
          }}
        >
          {s.publish}
        </Button>
        {dirty && (
          <Button
            variant="ghost"
            onClick={() => {
              setValues(toEditor(baseline));
              if (!save.isPending) save.reset();
            }}
          >
            {s.discard}
          </Button>
        )}
        {publishBlocked && (
          <p className="text-sm text-slate">{publishBlocked}</p>
        )}
      </div>
    </div>
  );
}
