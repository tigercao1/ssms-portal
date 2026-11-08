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
  revisionBody,
  useRemoveFormPdf,
  useSaveFormPlacements,
  useUploadFormPdf,
  type FormPlacement,
  type FormTemplate,
} from './api';
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
  revision,
  reloads,
  writing,
  placementsDirty,
  onDirtyChange,
  onWritten,
  onConflict,
}: {
  form: FormTemplate;
  lang: DocumentLanguage;
  sourceRecovery: SourceRecovery;
  revision: string | null;
  reloads: number;
  writing: boolean;
  placementsDirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onWritten: (form: FormTemplate) => void;
  onConflict: () => void;
}) {
  const t = useT();
  const s = t.signingForms;
  const { locale } = useLocale();
  const { draft, published } = form.languages[lang];
  const version = draft ?? published;
  const pdf = version?.originalPdf ?? null;
  const upload = useUploadFormPdf(form.id, lang);
  const remove = useRemoveFormPdf(form.id, lang);
  const placements = useSaveFormPlacements(form.id, lang);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const busy = writing || placementsDirty;
  const written = {
    onSuccess: onWritten,
    onError: (err: unknown) => {
      if (isConflict(err)) onConflict();
    },
  };
  const savePlacements = (list: FormPlacement[]) =>
    placements.mutate({ placements: list, ...revisionBody(revision) }, written);

  const reset = () => {
    upload.reset();
    remove.reset();
    placements.reset();
  };

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    reset();
    setConfirmingRemove(false);
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

      {draft ? (
        <div className="flex flex-wrap items-center gap-2">
          <FileButton
            size="sm"
            variant={pdf ? 'secondary' : 'primary'}
            accept="application/pdf,.pdf"
            loading={upload.isPending}
            disabled={busy}
            onChange={onFile}
          >
            {pdf ? s.replacePdf : s.uploadPdf}
          </FileButton>
          {pdf &&
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
      ) : (
        <p className="text-sm text-slate">{s.pdfNeedsDraft}</p>
      )}
      {draft && pdf && placementsDirty && (
        <p className="text-sm text-slate">{s.pdfSavePositionsFirst}</p>
      )}

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

      {pdf && version && (
        <PlacementEditor
          key={`${pdf.sha256}:${reloads}`}
          pdf={pdf}
          fields={version.fields}
          placements={version.placements}
          editable={draft !== null}
          sourceRecovery={sourceRecovery}
          writing={writing}
          onDirtyChange={onDirtyChange}
          save={placements}
          onSave={savePlacements}
        />
      )}
    </Card>
  );
}
