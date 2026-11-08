import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Spinner,
  Textarea,
  Toggle,
} from '@/components';
import { CopyLinkButton } from '@/features/admin/PageParts';
import { Markdown } from '@/sign/Markdown';
import type { DocumentLanguage } from '../api';
import { Chip } from '../admin/badges';
import { errorText, languageName, templateTitle } from '../admin/format';
import {
  FORM_BODY_MAX,
  FORM_LANGUAGES,
  FORM_TITLE_MAX,
  editableVersion,
  publicFormUrl,
  useForm,
  usePublishForm,
  useSaveFormDraft,
  useUpdateForm,
  type FormDraft,
  type FormTemplate,
} from './api';
import { FieldList, fieldsProblem } from './FieldList';

export function FormEditorPage() {
  const { id = '' } = useParams();
  const t = useT();
  const form = useForm(id);
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
  return <Editor form={form.data} />;
}

function Editor({ form }: { form: FormTemplate }) {
  const t = useT();
  const s = t.signingForms;
  const { locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const lang: DocumentLanguage = params.get('lang') === 'zh' ? 'zh' : 'en';
  const [dirty, setDirty] = useState(false);
  const title = templateTitle(form, locale);
  const url = publicFormUrl(form.slug);

  return (
    <div className="flex flex-col gap-5">
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
        title={dirty ? s.switchUnsaved : undefined}
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
            disabled={dirty && lang !== l}
            onClick={() => setParams(l === 'en' ? {} : { lang: l })}
            className={cn(
              'min-h-11 border-b-2 px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              lang === l
                ? 'border-red font-medium text-navy'
                : 'border-transparent text-slate hover:text-navy',
            )}
          >
            {languageName(l, t)}
          </button>
        ))}
      </div>
      {dirty && <p className="-mt-3 text-xs text-slate">{s.switchUnsaved}</p>}

      <div
        role="tabpanel"
        id={`form-panel-${lang}`}
        aria-labelledby={`form-tab-${lang}`}
      >
        <LanguageEditor
          key={lang}
          form={form}
          lang={lang}
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
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-ink">{s.emailCopy}</span>
        <Toggle
          checked={update.isPending ? !form.emailCopy : form.emailCopy}
          disabled={update.isPending}
          label={s.emailCopy}
          onChange={(emailCopy) => update.mutate({ emailCopy })}
        />
      </div>
      <p className="text-sm text-slate">{s.emailCopyHint}</p>
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
  onDirtyChange,
}: {
  form: FormTemplate;
  lang: DocumentLanguage;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useT();
  const s = t.signingForms;
  const { draft, published } = form.languages[lang];
  const baseline = baselineOf(form, lang);
  const [values, setValues] = useState<FormDraft>(baseline);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const save = useSaveFormDraft(form.id, lang);
  const publish = usePublishForm(form.id, lang);
  const dirty = !sameDraft(values, baseline);
  const problem = fieldsProblem(values.fields, t);
  const incomplete = !values.title.trim() || !values.bodyMarkdown.trim();
  const publishBlocked = dirty
    ? s.publishUnsaved
    : !draft
      ? s.publishNeedsDraft
      : null;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const edit = (patch: Partial<FormDraft>) => {
    setValues((v) => ({ ...v, ...patch }));
    save.reset();
    publish.reset();
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

      <div className="flex flex-wrap items-center gap-3">
        <Button
          loading={save.isPending}
          disabled={!dirty || incomplete || problem !== null}
          onClick={() => {
            publish.reset();
            save.mutate(
              {
                title: values.title.trim(),
                bodyMarkdown: values.bodyMarkdown,
                fields: values.fields.map((f) => ({
                  ...f,
                  label: f.label.trim(),
                })),
              },
              { onSuccess: (next) => setValues(baselineOf(next, lang)) },
            );
          }}
        >
          {s.saveDraft}
        </Button>
        <Button
          variant="secondary"
          loading={publish.isPending}
          disabled={publishBlocked !== null}
          onClick={() => {
            save.reset();
            publish.mutate();
          }}
        >
          {s.publish}
        </Button>
        {dirty && (
          <Button
            variant="ghost"
            onClick={() => {
              setValues(baseline);
              save.reset();
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
