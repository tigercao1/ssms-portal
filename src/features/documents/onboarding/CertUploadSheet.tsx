import { useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import type { CertOrg, CertTrack } from '@/lib/types';
import { todayIso } from '../api';
import { Sheet } from '../signer/Sheet';
import {
  CERT_CONTENT_TYPES,
  isValidUntilAcceptable,
  validateCertFile,
  type CertFileError,
} from './certFile';
import { useUploadCertification } from './queries';

interface CertUploadSheetProps {
  open: boolean;
  org: CertOrg;
  track: CertTrack;
  certLabel: string;
  onClose: () => void;
  onUploaded: () => void;
}

/** Upload one file for a certification row, with its required valid-until date. */
export function CertUploadSheet({
  open,
  org,
  track,
  certLabel,
  onClose,
  onUploaded,
}: CertUploadSheetProps) {
  const t = useT();
  const upload = useUploadCertification();
  const [file, setFile] = useState<File | null>(null);
  const [validUntil, setValidUntil] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const today = todayIso();

  useEffect(() => {
    if (open) {
      setFile(null);
      setValidUntil('');
      setSubmitted(false);
      upload.reset();
    }
  }, [open]);

  const fileError: CertFileError | null = validateCertFile(file);
  const dateError = !validUntil
    ? t.validation.required
    : !isValidUntilAcceptable(validUntil, today)
      ? t.onboarding.validUntilPast
      : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (fileError || dateError || !file) return;
    upload.mutate(
      { org, track, validUntil, file },
      { onSuccess: () => onUploaded() },
    );
  };

  const uploadError =
    upload.error instanceof Error && upload.error.message in t.onboarding
      ? t.onboarding[upload.error.message as CertFileError]
      : upload.error
        ? t.onboarding.uploadFailed
        : null;

  return (
    <Sheet
      open={open}
      title={t.onboarding.uploadTitle.replace('{cert}', certLabel)}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button size="sm" type="submit" form="cert-upload-form" loading={upload.isPending}>
            {upload.isPending ? t.onboarding.uploading : t.onboarding.uploadButton}
          </Button>
        </>
      }
    >
      <form id="cert-upload-form" noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label={t.onboarding.fileLabel}
          hint={t.onboarding.fileHint}
          error={submitted && fileError ? t.onboarding[fileError] : undefined}
          required
        >
          {(a11y) => (
            <input
              {...a11y}
              type="file"
              accept={CERT_CONTENT_TYPES.join(',')}
              className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border file:border-navy file:bg-transparent file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          )}
        </Field>
        <Field
          label={t.onboarding.validUntil}
          hint={t.onboarding.validUntilHint}
          error={submitted && dateError ? dateError : undefined}
          required
        >
          {(a11y) => (
            <Input
              {...a11y}
              type="date"
              min={today}
              required
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          )}
        </Field>
        {uploadError && (
          <p role="alert" className="text-sm text-status-rejected">
            {uploadError}
          </p>
        )}
      </form>
    </Sheet>
  );
}
