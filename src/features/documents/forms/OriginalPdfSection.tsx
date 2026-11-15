import { useState, type ChangeEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import { Banner, Button, Card, FileButton } from '@/components';
import type { DocumentLanguage } from '../api';
import type { SourceRecovery } from '../pdf/presignedSource';
import { errorText, formatBytes, pagesText, shortHash } from '../admin/format';
import {
  MAX_FORM_PDF_BYTES,
  MAX_FORM_PDF_PAGES,
  isConflict,
  useRemoveFormPdf,
  useUploadFormPdf,
  type FormTemplate,
} from './api';
import type { DraftField, DraftPlacement, FieldIssues } from './formFields';
import { PlacementEditor } from './PlacementEditor';

function uploadError(err: unknown, t: Messages): string {
  if (err instanceof ApiError && err.message === 'not-pdf')
    return t.documents.uploadNotPdf;
  if (err instanceof ApiError && err.message === 'too-large')
    return t.documents.uploadTooLarge.replace(
      '{mb}',
      String(MAX_FORM_PDF_BYTES / 1024 / 1024),
    );
  return t.documents.uploadFailed.replace(
    '{reason}',
    errorText(err, t.errors.generic),
  );
}

export function OriginalPdfSection({
  form,
  lang,
  sourceRecovery,
  writing,
  unsaved,
  fields,
  placements,
  issues,
  onChange,
  onEnsureDraft,
  onConflict,
  onWritten,
}: {
  form: FormTemplate;
  lang: DocumentLanguage;
  sourceRecovery: SourceRecovery;
  writing: boolean;
  unsaved: boolean;
  fields: DraftField[];
  placements: DraftPlacement[];
  issues: Map<string, FieldIssues>;
  onChange: (fields: DraftField[], placements: DraftPlacement[]) => void;
  onEnsureDraft: () => Promise<boolean>;
  onConflict: () => void;
  onWritten: (next: FormTemplate) => void;
}) {
  const t = useT();
  const s = t.signingForms;
  const { locale } = useLocale();
  const { draft, published } = form.languages[lang];
  const version = draft ?? published;
  const pdf = version?.originalPdf ?? null;
  const upload = useUploadFormPdf(form.id, lang);
  const remove = useRemoveFormPdf(form.id, lang);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const busy = writing || unsaved || preparing;
  const written = {
    onSuccess: onWritten,
    onError: (err: unknown) => {
      if (isConflict(err)) onConflict();
    },
  };

  const reset = () => {
    upload.reset();
    remove.reset();
  };

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    reset();
    setConfirmingRemove(false);
    if (!draft) {
      setPreparing(true);
      const ready = await onEnsureDraft().finally(() => setPreparing(false));
      if (!ready) return;
    }
    upload.mutate(file, written);
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">{s.pdfTitle}</h2>
        <p className="text-sm text-slate">
          {s.pdfHint
            .replace('{mb}', String(MAX_FORM_PDF_BYTES / 1024 / 1024))
            .replace('{pages}', String(MAX_FORM_PDF_PAGES))}
        </p>
      </div>

      {pdf ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a
            href={pdf.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-navy hover:underline"
          >
            {s.openPdf}
          </a>
          <span className="text-slate">
            {pagesText(pdf.pageCount, t)} · {formatBytes(pdf.sizeBytes, locale)}
          </span>
          <span className="font-mono text-xs text-slate" title={pdf.sha256}>
            SHA-256 {shortHash(pdf.sha256)}
          </span>
        </div>
      ) : (
        <p className="text-sm text-slate">{s.noPdf}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FileButton
          size="sm"
          variant={pdf ? 'secondary' : 'primary'}
          accept="application/pdf,.pdf"
          loading={upload.isPending || preparing}
          disabled={busy}
          onChange={(e) => void onFile(e)}
        >
          {pdf ? s.replacePdf : s.uploadPdf}
        </FileButton>
        {pdf &&
          draft &&
          (confirmingRemove ? (
            <>
              <span className="text-sm text-ink">{s.removeConfirm}</span>
              <Button
                size="sm"
                variant="danger"
                loading={remove.isPending}
                disabled={busy}
                onClick={() => {
                  reset();
                  remove.mutate(undefined, {
                    ...written,
                    onSettled: () => setConfirmingRemove(false),
                  });
                }}
              >
                {s.removePdf}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingRemove(false)}
              >
                {t.common.cancel}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmingRemove(true)}
            >
              {s.removePdf}
            </Button>
          ))}
      </div>
      {unsaved && <p className="text-sm text-slate">{s.pdfSaveFirst}</p>}

      {upload.isError && (
        <Banner tone="error">{uploadError(upload.error, t)}</Banner>
      )}
      {remove.isError && (
        <Banner tone="error">
          {s.removeFailed.replace(
            '{reason}',
            errorText(remove.error, t.errors.generic),
          )}
        </Banner>
      )}
      {upload.isSuccess && (
        <Banner tone={upload.data.placementsCleared ? 'pending' : 'approved'}>
          {upload.data.placementsCleared ? s.placementsCleared : s.pdfUploaded}
        </Banner>
      )}
      {remove.isSuccess && <Banner tone="approved">{s.pdfRemoved}</Banner>}

      {pdf && (
        <PlacementEditor
          key={pdf.sha256}
          pdf={pdf}
          fields={fields}
          placements={placements}
          lang={lang}
          issues={issues}
          editable={!writing}
          sourceRecovery={sourceRecovery}
          onChange={onChange}
        />
      )}
    </Card>
  );
}
