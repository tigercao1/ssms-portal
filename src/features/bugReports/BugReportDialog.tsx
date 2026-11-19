import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from 'react';
import {
  Banner,
  Button,
  Field,
  FileButton,
  Modal,
  Textarea,
} from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import { collectEnvironment } from './environment';
import { submitErrorText, useSubmitBugReport } from './reportApi';
import {
  prepareScreenshot,
  ScreenshotError,
  SCREENSHOT_TYPES,
  type ScreenshotProblem,
} from './screenshot';
import type { BugSeverity } from './types';

export const DESCRIPTION_MAX = 4000;
export const EXPECTED_MAX = 2000;

const SEVERITIES: {
  value: BugSeverity;
  label: 'severityBlocked' | 'severityWrong' | 'severityMinor';
}[] = [
  { value: 'blocked', label: 'severityBlocked' },
  { value: 'wrong', label: 'severityWrong' },
  { value: 'minor', label: 'severityMinor' },
];

interface Screenshot {
  blob: Blob;
  url: string;
}

export function BugReportDialog({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useT();
  const s = t.bugReport;
  const formId = useId();
  const severityName = useId();
  const [environment] = useState(() => collectEnvironment());
  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [severity, setSeverity] = useState<BugSeverity | null>(null);
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [screenshotProblem, setScreenshotProblem] =
    useState<ScreenshotProblem | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const refocusFileInput = useRef(false);
  const submit = useSubmitBugReport();

  const unsaved =
    description.trim() !== '' || expected.trim() !== '' || screenshot !== null;
  const descriptionError =
    submitted && !description.trim() ? s.whatHappenedRequired : undefined;

  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);

  useEffect(() => {
    if (!screenshot) {
      if (refocusFileInput.current) fileRef.current?.focus();
      refocusFileInput.current = false;
      return;
    }
    return () => URL.revokeObjectURL(screenshot.url);
  }, [screenshot]);

  const requestClose = () => {
    if (submit.isPending) return;
    if (unsaved) setConfirmingDiscard(true);
    else onClose();
  };

  const attach = async (file: Blob) => {
    setScreenshotProblem(null);
    setPreparing(true);
    try {
      const blob = await prepareScreenshot(file);
      setScreenshot({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setScreenshotProblem(
        err instanceof ScreenshotError ? err.problem : 'screenshotUnreadable',
      );
    } finally {
      setPreparing(false);
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const image = [...e.clipboardData.files].find((file) =>
      file.type.startsWith('image/'),
    );
    if (!image) return;
    e.preventDefault();
    void attach(image);
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    setScreenshotProblem(null);
    refocusFileInput.current = true;
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!description.trim()) {
      descriptionRef.current?.focus();
      return;
    }
    if (sending.current || preparing) return;
    sending.current = true;
    const sent = await submit
      .mutateAsync({
        report: {
          description: description.trim(),
          ...(expected.trim() && { expected: expected.trim() }),
          ...(severity && { severity }),
          ...environment,
        },
        screenshot: screenshot?.blob ?? null,
      })
      .then(
        () => true,
        () => false,
      );
    sending.current = false;
    if (sent) onSent();
  };

  return (
    <>
      <Modal
        title={s.title}
        onClose={requestClose}
        footer={
          <>
            <Button variant="ghost" onClick={requestClose}>
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              form={formId}
              loading={submit.isPending}
              disabled={preparing}
            >
              {submit.isPending ? s.sending : s.send}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          onSubmit={send}
          onPaste={onPaste}
          className="flex flex-col gap-4"
        >
          {submit.isError && (
            <Banner tone="error">{submitErrorText(submit.error, t)}</Banner>
          )}
          <Field
            label={s.whatHappened}
            hint={s.whatHappenedHint}
            error={descriptionError}
            required
          >
            {(a11y) => (
              <Textarea
                {...a11y}
                ref={descriptionRef}
                data-private
                rows={5}
                required
                maxLength={DESCRIPTION_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>
          <Field label={s.expected} hint={s.expectedHint}>
            {(a11y) => (
              <Textarea
                {...a11y}
                data-private
                rows={3}
                maxLength={EXPECTED_MAX}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
            )}
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-navy">
              {s.severity}
            </legend>
            {SEVERITIES.map((option) => (
              <label
                key={option.value}
                className="flex min-h-9 items-center gap-2 text-sm text-ink"
              >
                <input
                  type="radio"
                  name={severityName}
                  value={option.value}
                  checked={severity === option.value}
                  onChange={() => setSeverity(option.value)}
                  className="h-4 w-4 accent-navy"
                />
                {s[option.label]}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-navy">
              {s.screenshot}
            </span>
            {screenshot ? (
              <div className="flex flex-col items-start gap-2">
                <img
                  data-private
                  src={screenshot.url}
                  alt={s.screenshotPreview}
                  className="max-h-48 max-w-full rounded-md border border-grey object-contain"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={removeScreenshot}
                >
                  {s.removeScreenshot}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-1.5">
                <FileButton
                  ref={fileRef}
                  variant="secondary"
                  size="sm"
                  accept={SCREENSHOT_TYPES.join(',')}
                  loading={preparing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void attach(file);
                  }}
                >
                  {preparing ? s.preparingScreenshot : s.addScreenshot}
                </FileButton>
                <p className="text-sm text-slate">{s.screenshotHint}</p>
              </div>
            )}
            {screenshotProblem && (
              <p role="alert" className="text-sm text-status-rejected">
                {s[screenshotProblem]}
              </p>
            )}
          </div>
          <details className="text-sm text-slate">
            <summary className="cursor-pointer">{s.alsoSend}</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all">
              <dt>{s.envPage}</dt>
              <dd className="font-mono text-xs">{environment.pageUrl}</dd>
              <dt>{s.envBrowser}</dt>
              <dd className="font-mono text-xs">{environment.userAgent}</dd>
              <dt>{s.envScreen}</dt>
              <dd className="font-mono text-xs">{environment.viewport}</dd>
            </dl>
          </details>
        </form>
      </Modal>
      {confirmingDiscard && (
        <Modal
          title={s.discardTitle}
          onClose={() => setConfirmingDiscard(false)}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setConfirmingDiscard(false)}
              >
                {s.keepEditing}
              </Button>
              <Button variant="danger" onClick={onClose}>
                {s.discard}
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink">{s.discardBody}</p>
        </Modal>
      )}
    </>
  );
}
