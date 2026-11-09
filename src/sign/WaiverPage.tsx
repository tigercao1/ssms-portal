import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { ButtonSpinner, buttonClasses } from '@/components/Button';
import { Input } from '@/components/Input';
import {
  SignApiError,
  completeSignForm,
  fetchSignForm,
  type SignErrorKind,
  type SignField,
  type SignForm,
  type SignLang,
} from './api';
import { Markdown } from './Markdown';
import { SIGN_MESSAGES, type SignMessages } from './messages';
import { OriginalDocument } from './OriginalDocument';
import { useOriginalPdf } from './pdf/useOriginalPdf';
import { SignaturePadField } from './SignaturePadField';
import { torontoToday } from './torontoDate';

interface WaiverPageProps {
  slug: string;
  lang: SignLang;
  returnUrl: string | null;
  onLangChange: (lang: SignLang) => void;
}

interface Notice {
  message: string;
  reasons: string[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; kind: SignErrorKind }
  | { status: 'ready'; form: SignForm }
  | { status: 'signed'; emailed: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ANSWER_LENGTH = 500;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const LANGUAGES: { lang: SignLang; label: string }[] = [
  { lang: 'en', label: 'English' },
  { lang: 'zh', label: '中文' },
];

const SUBMIT_NOTICE: Partial<
  Record<SignErrorKind, 'stale' | 'invalid' | 'throttled'>
> = {
  stale: 'stale',
  invalid: 'invalid',
  throttled: 'throttled',
};

function errorKind(error: unknown): SignErrorKind {
  return error instanceof SignApiError ? error.kind : 'failed';
}

function errorReasons(error: unknown): string[] {
  return error instanceof SignApiError ? error.reasons : [];
}

function fieldId(key: string) {
  return `field-${key}`;
}

function validate(
  fields: SignField[],
  answers: Record<string, string>,
  signatures: Record<string, string | null>,
  oversized: Record<string, boolean>,
  text: SignMessages,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === 'signature') {
      if (oversized[field.key]) errors[field.key] = text.signatureTooLarge;
      else if (field.required && !signatures[field.key])
        errors[field.key] = text.signatureRequired(field.label);
      continue;
    }
    const value = (answers[field.key] ?? '').trim();
    if (field.required && !value)
      errors[field.key] = text.required(field.label);
    else if ([...value].length > MAX_ANSWER_LENGTH)
      errors[field.key] = text.tooLong(field.label, MAX_ANSWER_LENGTH);
    else if (field.type === 'email' && value && !EMAIL.test(value))
      errors[field.key] = text.invalidEmail;
  }
  return errors;
}

export function WaiverPage({
  slug,
  lang,
  returnUrl,
  onLangChange,
}: WaiverPageProps) {
  const text = SIGN_MESSAGES[lang];
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signatures, setSignatures] = useState<Record<string, string | null>>(
    {},
  );
  const [oversized, setOversized] = useState<Record<string, boolean>>({});
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consentError, setConsentError] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const signedRef = useRef<HTMLHeadingElement>(null);
  const servedForm = state.status === 'ready' ? state.form : null;
  const originalPdf = useOriginalPdf(
    slug,
    servedForm?.lang ?? lang,
    servedForm?.hasOriginalPdf === true,
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const form = await fetchSignForm(slug, lang, signal);
        if (signal?.aborted) return;
        setAnswers((current) => {
          const next = { ...current };
          for (const field of form.fields)
            if (field.type === 'date' && next[field.key] === undefined)
              next[field.key] = torontoToday();
          return next;
        });
        setState({ status: 'ready', form });
      } catch (error) {
        if (!signal?.aborted)
          setState({ status: 'error', kind: errorKind(error) });
      }
    },
    [slug, lang],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    document.documentElement.lang = text.htmlLang;
    if (state.status === 'ready') document.title = state.form.title;
  }, [state, text.htmlLang]);

  useEffect(() => {
    if (state.status !== 'signed') return;
    window.scrollTo(0, 0);
    signedRef.current?.focus();
  }, [state.status]);

  const setAnswer = (key: string, value: string) => {
    setAnswers((current) => ({ ...current, [key]: value }));
    setErrors(({ [key]: _cleared, ...rest }) => rest);
  };

  const setSignature = (key: string, png: string | null, tooLarge: boolean) => {
    setSignatures((current) => ({ ...current, [key]: png }));
    setOversized((current) => ({ ...current, [key]: tooLarge }));
    if (tooLarge)
      setErrors((current) => ({ ...current, [key]: text.signatureTooLarge }));
    else if (png) setErrors(({ [key]: _cleared, ...rest }) => rest);
  };

  const switchLang = (next: SignLang) => {
    if (next === lang) return;
    setErrors({});
    setConsentError(false);
    setNotice(null);
    onLangChange(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state.status !== 'ready' || submitting) return;
    const { form } = state;
    const nextErrors = validate(
      form.fields,
      answers,
      signatures,
      oversized,
      text,
    );
    setErrors(nextErrors);
    setConsentError(!consent);
    const firstInvalid = form.fields.find((field) => nextErrors[field.key]);
    if (firstInvalid || !consent) {
      setNotice({ message: text.fixErrors, reasons: [] });
      document
        .getElementById(firstInvalid ? fieldId(firstInvalid.key) : 'consent')
        ?.focus();
      return;
    }
    const answerValues: Record<string, string> = {};
    const signatureValues: Record<string, string> = {};
    for (const field of form.fields) {
      if (field.type === 'signature') {
        const png = signatures[field.key];
        if (png) signatureValues[field.key] = png;
      } else {
        const value = (answers[field.key] ?? '').trim();
        if (value) answerValues[field.key] = value;
      }
    }
    const body = {
      lang: form.lang,
      version: form.version,
      answers: answerValues,
      signatures: signatureValues,
      consent: true as const,
    };
    if (
      new TextEncoder().encode(JSON.stringify(body)).length > MAX_BODY_BYTES
    ) {
      setNotice({ message: text.payloadTooLarge, reasons: [] });
      return;
    }
    setNotice(null);
    setSubmitting(true);
    try {
      const result = await completeSignForm(slug, body);
      setState({ status: 'signed', emailed: result.emailed });
    } catch (error) {
      const kind = errorKind(error);
      const key = SUBMIT_NOTICE[kind];
      const reasons = kind === 'invalid' ? errorReasons(error) : [];
      setNotice({ message: key ? text[key] : text.submitFailed, reasons });
      if (reasons.length) {
        const rejected: Record<string, string> = {};
        for (const field of form.fields)
          if (reasons.some((reason) => reason.includes(`(${field.key})`)))
            rejected[field.key] = text.notAccepted(field.label);
        setErrors(rejected);
      }
      if (kind === 'stale') await load();
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === 'loading')
    return (
      <p role="status" className="py-10 text-center text-slate">
        {text.loading}
      </p>
    );

  if (state.status === 'error')
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-4 py-10 text-center"
      >
        <p>{state.kind === 'not_found' ? text.notFound : text.loadFailed}</p>
        {state.kind !== 'not_found' && (
          <button
            type="button"
            className={buttonClasses({ variant: 'secondary' })}
            onClick={() => {
              setState({ status: 'loading' });
              void load();
            }}
          >
            {text.retry}
          </button>
        )}
      </div>
    );

  if (state.status === 'signed')
    return (
      <div className="flex flex-col items-center gap-5 py-10 text-center">
        <h1
          ref={signedRef}
          tabIndex={-1}
          className="text-xl font-semibold focus:outline-none"
        >
          {state.emailed ? text.signed : text.signedNotEmailed}
        </h1>
        {returnUrl && (
          <a
            href={returnUrl}
            target="_top"
            className={buttonClasses({ variant: 'secondary' })}
          >
            {text.back}
          </a>
        )}
      </div>
    );

  const { form } = state;
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <div
        role="group"
        aria-label={text.language}
        className="flex justify-end gap-1"
      >
        {LANGUAGES.map((option) => (
          <button
            key={option.lang}
            type="button"
            lang={option.lang}
            aria-pressed={option.lang === lang}
            onClick={() => switchLang(option.lang)}
            className={`min-h-11 rounded-md px-3 text-sm font-medium ${option.lang === lang ? 'bg-navy text-white' : 'text-navy hover:bg-navy-tint'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {form.hasOriginalPdf && (
        <OriginalDocument
          pdf={originalPdf}
          info={form.originalPdf ?? null}
          text={text}
        />
      )}
      <h1 className="text-2xl leading-tight">{form.title}</h1>
      <Markdown source={form.bodyMarkdown} />
      <div className="flex flex-col gap-5 border-t border-grey pt-5">
        {form.fields.map((field) => {
          const error = errors[field.key];
          const errorId = `${fieldId(field.key)}-error`;
          const labelId = `${fieldId(field.key)}-label`;
          const label = (
            <span className="text-sm font-medium text-navy">
              {field.label}
              {!field.required && (
                <span className="font-normal text-slate">
                  {' '}
                  ({text.optional})
                </span>
              )}
            </span>
          );
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              {field.type === 'signature' ? (
                <div
                  id={fieldId(field.key)}
                  role="group"
                  tabIndex={-1}
                  aria-labelledby={labelId}
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={error ? true : undefined}
                  className="flex flex-col gap-1.5"
                >
                  <span id={labelId}>{label}</span>
                  <SignaturePadField
                    label={field.label}
                    text={text}
                    invalid={Boolean(error)}
                    onChange={(png, tooLarge) =>
                      setSignature(field.key, png, tooLarge)
                    }
                  />
                </div>
              ) : (
                <>
                  <label htmlFor={fieldId(field.key)}>{label}</label>
                  <Input
                    id={fieldId(field.key)}
                    name={field.key}
                    type={field.type}
                    className="text-base"
                    autoComplete={field.type === 'email' ? 'email' : undefined}
                    value={answers[field.key] ?? ''}
                    required={field.required}
                    aria-required={field.required}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(event) =>
                      setAnswer(field.key, event.target.value)
                    }
                  />
                </>
              )}
              {error && (
                <p id={errorId} className="text-sm text-status-rejected">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3 text-base">
          <input
            id="consent"
            type="checkbox"
            checked={consent}
            aria-invalid={consentError ? true : undefined}
            aria-describedby={consentError ? 'consent-error' : undefined}
            onChange={(event) => {
              setConsent(event.target.checked);
              if (event.target.checked) setConsentError(false);
            }}
            className="mt-1 h-5 w-5 shrink-0 accent-navy"
          />
          <span>{text.consent}</span>
        </label>
        {consentError && (
          <p id="consent-error" className="text-sm text-status-rejected">
            {text.consentRequired}
          </p>
        )}
      </div>
      {notice && (
        <p
          role="alert"
          className="rounded-md bg-red-tint px-3 py-2 text-sm text-ink"
        >
          {notice.message}
          {notice.reasons.map((reason) => (
            <span key={reason} className="mt-1 block text-slate">
              {reason}
            </span>
          ))}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className={buttonClasses({ className: 'w-full' })}
      >
        {submitting && <ButtonSpinner />}
        {submitting ? text.submitting : text.submit}
      </button>
    </form>
  );
}
