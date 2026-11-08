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
  editableVersion,
  isConflict,
  publicFormUrl,
  revisionOf,
  unplacedRequired,
  useDraftRevision,
  useForm,
  useFormWriting,
  usePublishForm,
  useReloadForm,
  useSaveFormDraft,
  useUpdateForm,
  type FormDraft,
  type FormTemplate,
} from './api';
import { FieldList, fieldsProblem } from './FieldList';
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

function baselineOf(form: FormTemplate, lang: DocumentLanguage): FormDraft {
  const version = editableVersion(form, lang);
  return {
    title:
      version?.title ??
      (lang === 'zh' ? (form.titleZh ?? form.titleEn) : form.titleEn),
    bodyMarkdown: version?.bodyMarkdown ?? '',
    fields: version?.fields ?? form.defaultFields[lang],
  };
}

function sameDraft(a: FormDraft, b: FormDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
  const [values, setValues] = useState<FormDraft>(baseline);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [revision, setRevision] = useDraftRevision(form, lang);
  const [reloaded, setReloaded] = useState<{ mine: FormDraft | null } | null>(
    null,
  );
  const [reloads, setReloads] = useState(0);
  const latest = useRef(values);
  latest.current = values;
  const textDirty = useRef(false);
  const save = useSaveFormDraft(form.id, lang);
  const publish = usePublishForm(form.id, lang);
  const reload = useReloadForm(form.id);
  const writing = useFormWriting(form.id, lang);
  const dirty = !sameDraft(values, baseline);
  textDirty.current = dirty;
  const [placementsDirty, setPlacementsDirty] = useState(false);
  const unsaved = dirty || placementsDirty || !!reloaded?.mine;
  const problem = fieldsProblem(values.fields, t);
  const incomplete = !values.title.trim() || !values.bodyMarkdown.trim();
  const unplaced = draft ? unplacedRequired(draft) : [];
  const publishBlocked = dirty
    ? s.publishUnsaved
    : !draft
      ? s.publishNeedsDraft
      : placementsDirty
        ? s.publishPlacementsUnsaved
        : unplaced.length > 0
          ? s.publishNeedsPlacements.replace(
              '{fields}',
              unplaced.map((f) => f.label).join(', '),
            )
          : null;

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

  const edit = (patch: Partial<FormDraft>) => {
    setValues((v) => ({ ...v, ...patch }));
    if (!publish.isPending) publish.reset();
  };

  const reloadAfterConflict = (keepMine: (mine: FormDraft) => boolean) =>
    reload().then(
      (fresh) => {
        const mine = latest.current;
        save.reset();
        publish.reset();
        setRevision(revisionOf(fresh, lang));
        setValues(baselineOf(fresh, lang));
        setReloaded({ mine: keepMine(mine) ? mine : null });
        setReloads((n) => n + 1);
      },
      () => undefined,
    );

  const saveDraft = () => {
    const sent = values;
    publish.reset();
    setReloaded(null);
    save.mutate(
      {
        title: sent.title.trim(),
        bodyMarkdown: sent.bodyMarkdown,
        fields: sent.fields.map((f) => ({ ...f, label: f.label.trim() })),
        expectedUpdatedAt: revision,
      },
      {
        onSuccess: (next) =>
          setValues((v) => (v === sent ? baselineOf(next, lang) : v)),
        onError: (err) => {
          if (isConflict(err)) void reloadAfterConflict(() => true);
        },
      },
    );
  };

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
            <span className="text-sm font-medium text-navy">
              {s.body}
              <span className="ml-0.5 text-red">*</span>
            </span>
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
          defaults={form.defaultFields[lang]}
          onChange={(fields) => edit({ fields })}
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
        revision={revision}
        reloads={reloads}
        writing={writing}
        placementsDirty={placementsDirty}
        onDirtyChange={setPlacementsDirty}
        onWritten={(next) => setRevision(revisionOf(next, lang))}
        onConflict={() => void reloadAfterConflict(() => textDirty.current)}
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
                    setValues(reloaded.mine ?? baseline);
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
          onClick={saveDraft}
        >
          {s.saveDraft}
        </Button>
        <Button
          variant="secondary"
          loading={publish.isPending}
          disabled={publishBlocked !== null || writing}
          onClick={() => {
            const sent = values;
            save.reset();
            setReloaded(null);
            if (revision === null) {
              void reloadAfterConflict(() => false);
              return;
            }
            publish.mutate(revision, {
              onError: (err) => {
                if (isConflict(err))
                  void reloadAfterConflict((mine) => !sameDraft(mine, sent));
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
              setValues(baseline);
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
