import { useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Spinner } from '@/components';
import type {
  ConfirmedTemplate,
  DocumentLanguage,
  TemplateSummary,
} from '../api';
import {
  useDeleteTranslation,
  useTemplate,
  useUploadTemplateSource,
} from './hooks';
import {
  errorText,
  languageName,
  pagesText,
  templateTitle,
  uploadErrorText,
} from './format';

export interface OtherLanguageNotice {
  id: string;
  tone: 'approved' | 'error';
  text: string;
}

export function otherLanguageOf(language: DocumentLanguage): DocumentLanguage {
  return language === 'zh' ? 'en' : 'zh';
}

export function OtherLanguageVersion({
  row,
  sourceLanguage,
  onNotice,
}: {
  row: TemplateSummary;
  sourceLanguage: DocumentLanguage;
  onNotice: (n: OtherLanguageNotice | null) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const template = useTemplate(row.id);
  const upload = useUploadTemplateSource();
  const remove = useDeleteTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const language = otherLanguageOf(sourceLanguage);
  const name = languageName(language, t);
  const title = templateTitle(row, locale);
  const translation = template.data?.translations.find(
    (tr) => tr.language === language,
  );
  const hasPdf = Boolean(translation?.hasSource);
  const locked = row.hasCompletedAssignments;
  const fill = (text: string) =>
    text.replace('{language}', name).replace('{title}', title);

  function onFile(file: File | undefined) {
    if (!file) return;
    onNotice(null);
    upload.mutate(
      { id: row.id, file, language },
      {
        onSuccess: (tpl: ConfirmedTemplate) => {
          const uploaded = tpl.translations.find(
            (tr) => tr.language === language,
          );
          onNotice({
            id: row.id,
            tone: 'approved',
            text: fill(t.documents.otherLanguageUploaded).replace(
              '{pages}',
              pagesText(uploaded?.pageCount ?? null, t),
            ),
          });
        },
        onError: (err) =>
          onNotice({
            id: row.id,
            tone: 'error',
            text: uploadErrorText(err, t),
          }),
      },
    );
    if (fileRef.current) fileRef.current.value = '';
  }

  function onRemove() {
    onNotice(null);
    remove.mutate(
      { id: row.id, language },
      {
        onSuccess: () =>
          onNotice({
            id: row.id,
            tone: 'approved',
            text: fill(t.documents.otherLanguageRemoved),
          }),
      },
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-grey/60 pt-4"
    >
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-base">
          {t.documents.otherLanguageTitle}
        </h3>
        <p className="text-sm text-slate">
          {fill(t.documents.otherLanguageIntro)}
        </p>
      </div>
      {template.isLoading ? (
        <Spinner />
      ) : (
        <>
          <p className="text-sm text-ink">
            {translation && hasPdf
              ? fill(t.documents.otherLanguageReady)
                  .replace('{pages}', pagesText(translation.pageCount, t))
                  .replace(
                    '{fields}',
                    t.documents.fieldCount.replace(
                      '{n}',
                      String(translation.fields.length),
                    ),
                  )
              : fill(t.documents.otherLanguageMissing)}
          </p>
          {row.kind === 'sign' &&
            hasPdf &&
            translation?.fields.length === 0 && (
              <Banner tone="pending">
                {fill(t.documents.otherLanguageNeedsFields)}
              </Banner>
            )}
          {locked && (
            <p className="text-xs text-slate">{t.documents.lockedSigned}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              tabIndex={-1}
              aria-label={fill(t.documents.uploadOtherLanguageFor)}
              disabled={locked}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="ghost"
              loading={upload.isPending}
              disabled={locked}
              onClick={() => fileRef.current?.click()}
            >
              {fill(
                hasPdf
                  ? t.documents.replaceOtherLanguage
                  : t.documents.uploadOtherLanguage,
              )}
            </Button>
            {hasPdf && !(row.kind === 'sign' && locked) && (
              <Link
                to={`/admin/documents/${row.id}/edit?language=${language}`}
                className="inline-flex h-9 items-center rounded-md border border-navy px-3 text-sm font-medium text-navy hover:bg-navy-tint"
              >
                {fill(
                  row.kind === 'sign'
                    ? t.documents.placeOtherLanguageFields
                    : t.documents.previewOtherLanguage,
                )}
              </Link>
            )}
            {translation && (
              <Button
                size="sm"
                variant="ghost"
                loading={remove.isPending}
                disabled={locked}
                onClick={onRemove}
              >
                {fill(t.documents.removeOtherLanguage)}
              </Button>
            )}
          </div>
          {remove.isError && (
            <p role="alert" className="text-xs text-status-rejected">
              {errorText(remove.error, t.errors.generic)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
