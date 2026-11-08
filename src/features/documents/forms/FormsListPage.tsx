import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { formatDateTime } from '@/lib/date';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Spinner,
} from '@/components';
import { CopyLinkButton } from '@/features/admin/PageParts';
import type { DocumentLanguage } from '../api';
import { Chip } from '../admin/badges';
import { errorText, languageName, templateTitle } from '../admin/format';
import {
  FORM_LANGUAGES,
  FORM_SLUG_MAX,
  FORM_SLUG_PATTERN,
  FORM_TITLE_MAX,
  publicFormUrl,
  useCreateForm,
  useForms,
  type FormTemplateSummary,
} from './api';

export function FormsListPage() {
  const t = useT();
  const s = t.signingForms;
  const forms = useForms();
  const rows = [...(forms.data ?? [])].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">{s.title}</h1>
        <p className="max-w-3xl text-slate">{s.intro}</p>
      </div>

      {forms.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : forms.isError ? (
        <Banner tone="error">{errorText(forms.error, t.errors.generic)}</Banner>
      ) : rows.length === 0 ? (
        <EmptyState title={s.empty}>{s.emptyBody}</EmptyState>
      ) : (
        <ul
          aria-label={s.listLabel}
          className="flex flex-col gap-3"
          data-public
        >
          {rows.map((row) => (
            <FormRow key={row.id} row={row} />
          ))}
        </ul>
      )}

      <CreateForm />
    </div>
  );
}

function FormRow({ row }: { row: FormTemplateSummary }) {
  const t = useT();
  const s = t.signingForms;
  const { locale } = useLocale();
  const title = templateTitle(row, locale);
  const url = publicFormUrl(row.slug);
  const live = FORM_LANGUAGES.some((l) => row.publishedVersions[l] !== null);
  const pdfLanguages = FORM_LANGUAGES.filter((l) => row.hasOriginalPdf[l]);

  return (
    <li aria-label={row.titleEn}>
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {row.titleZh && (
              <p className="text-sm text-slate">
                {locale === 'zh-CN' ? row.titleEn : row.titleZh}
              </p>
            )}
            <p className="font-mono text-xs text-slate">{row.slug}</p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={s.colPublished}>
            <span className="flex flex-wrap gap-1">
              {FORM_LANGUAGES.map((lang) => (
                <PublishedChip key={lang} row={row} lang={lang} />
              ))}
            </span>
          </Fact>
          <Fact label={s.colEmailCopy}>{row.emailCopy ? s.on : s.off}</Fact>
          <Fact label={s.colPdf}>
            {pdfLanguages.length === 0
              ? s.pdfNone
              : pdfLanguages.map((l) => languageName(l, t)).join(' · ')}
          </Fact>
          <Fact label={s.colChanged}>
            {formatDateTime(row.lastChangedAt, locale)}
          </Fact>
        </dl>

        <div className="flex flex-col gap-1 border-t border-grey/40 pt-3 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-slate">
            {s.colLink}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 break-all font-mono text-sm text-navy hover:underline"
          >
            {url}
          </a>
          <CopyLinkButton
            url={url}
            ariaLabel={s.copyLinkFor.replace('{title}', title)}
          />
          {!live && (
            <span className="text-xs text-slate">{s.linkInactive}</span>
          )}
        </div>
      </Card>
    </li>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function PublishedChip({
  row,
  lang,
}: {
  row: FormTemplateSummary;
  lang: DocumentLanguage;
}) {
  const t = useT();
  const s = t.signingForms;
  const name = languageName(lang, t);
  const version = row.publishedVersions[lang];
  if (version !== null)
    return (
      <Chip
        tone={row.hasDraft[lang] ? 'pending' : 'approved'}
        label={(row.hasDraft[lang] ? s.versionWithDraft : s.versionOf)
          .replace('{lang}', name)
          .replace('{n}', String(version))}
      />
    );
  return (
    <Chip
      tone="neutral"
      label={
        row.hasDraft[lang]
          ? s.draftOf.replace('{lang}', name)
          : `${name} · ${s.notPublished}`
      }
    />
  );
}

function CreateForm() {
  const t = useT();
  const s = t.signingForms;
  const create = useCreateForm();
  const [slug, setSlug] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [titleZh, setTitleZh] = useState('');
  const [touched, setTouched] = useState(false);
  const slugValid = FORM_SLUG_PATTERN.test(slug);

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!slugValid || !titleEn.trim()) return;
    create.mutate(
      {
        slug,
        titleEn: titleEn.trim(),
        ...(titleZh.trim() && { titleZh: titleZh.trim() }),
      },
      {
        onSuccess: () => {
          setSlug('');
          setTitleEn('');
          setTitleZh('');
          setTouched(false);
        },
      },
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">{s.createTitle}</h2>
        <p className="text-sm text-slate">{s.createHint}</p>
      </div>
      <form className="grid gap-4 sm:grid-cols-3" onSubmit={submit} noValidate>
        <Field
          label={s.slugLabel}
          required
          hint={slug && slugValid ? publicFormUrl(slug) : s.slugHint}
          error={touched && !slugValid ? s.slugInvalid : undefined}
        >
          {(p) => (
            <Input
              {...p}
              value={slug}
              maxLength={FORM_SLUG_MAX}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setSlug(e.target.value.trim().toLowerCase())}
            />
          )}
        </Field>
        <Field
          label={s.titleEnLabel}
          required
          error={touched && !titleEn.trim() ? t.validation.required : undefined}
        >
          {(p) => (
            <Input
              {...p}
              value={titleEn}
              maxLength={FORM_TITLE_MAX}
              onChange={(e) => setTitleEn(e.target.value)}
            />
          )}
        </Field>
        <Field label={s.titleZhLabel}>
          {(p) => (
            <Input
              {...p}
              value={titleZh}
              maxLength={FORM_TITLE_MAX}
              onChange={(e) => setTitleZh(e.target.value)}
            />
          )}
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" loading={create.isPending}>
            {s.create}
          </Button>
        </div>
      </form>
      {create.isError && (
        <Banner tone="error">
          {errorText(create.error, t.errors.generic)}
        </Banner>
      )}
      {create.isSuccess && (
        <Banner tone="approved">
          {s.created.replace('{title}', create.data.titleEn)}
        </Banner>
      )}
    </Card>
  );
}
