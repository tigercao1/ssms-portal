import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Button, Input } from '@/components';
import type { Locale } from '@/i18n/core/types';
import type { Field, SignCompletion, SignatureValue, SignerTemplate } from '../api';
import { PdfPages, type PdfPagesHandle } from '../pdf/PdfPages';
import { pdfRectToScreen } from '../pdf/transforms';
import { ConsentBlock } from './ConsentBlock';
import { FieldOverlay } from './FieldOverlay';
import {
  buildSignBody,
  initialValues,
  isFieldFilled,
  missingRequired,
  orderFields,
  syncLockedValues,
  type FieldSignatures,
  type FieldValues,
} from './fieldLogic';
import { SignatureModal } from './SignatureModal';
import type { SignerText } from './types';

export interface SignerDocumentProps {
  template: SignerTemplate;
  sourceUrl: string;
  defaultSignerName: string;
  signerEmail?: string | null;
  today: string;
  locale: Locale;
  text: SignerText;
  submitting?: boolean;
  submitError?: string | null;
  onSubmit: (body: SignCompletion) => void;
}

const MOBILE_QUERY = '(max-width: 767px)';
const MOBILE_MIN_FIELD_PX = 220;
const MAX_ZOOM = 3;

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return;
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return mobile;
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1 && /[\u3400-\u9fff]/.test(words[0] ?? '')) return words[0] ?? '';
  return words.map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function fieldLabel(field: Field, locale: Locale, text: SignerText): string {
  const custom = locale === 'zh-CN' && field.labelZh ? field.labelZh : field.labelEn;
  if (custom?.trim()) return custom;
  switch (field.type) {
    case 'signature':
      return text.fieldSignature;
    case 'initials':
      return text.fieldInitials;
    case 'full_name':
      return text.fieldFullName;
    case 'date':
      return text.fieldDate;
    case 'checkbox':
      return text.fieldCheckbox;
    default:
      return text.fieldText;
  }
}

/**
 * Fill-and-sign view for a `sign` template: the PDF with inputs at each field
 * rect, a required-field stepper, the legal-name input and the consent box.
 * Free of portal routing and API calls so another signing app can reuse it.
 */
export function SignerDocument({
  template,
  sourceUrl,
  defaultSignerName,
  signerEmail,
  today,
  locale,
  text,
  submitting = false,
  submitError,
  onSubmit,
}: SignerDocumentProps) {
  const pdfRef = useRef<PdfPagesHandle>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const ordered = useMemo(() => orderFields(template.fields), [template.fields]);
  const required = useMemo(() => ordered.filter((f) => f.required), [ordered]);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const identity = useMemo(
    () => ({ signerName, email: signerEmail, today }),
    [signerName, signerEmail, today],
  );
  const [values, setValues] = useState<FieldValues>(() =>
    initialValues(template.fields, { signerName: defaultSignerName, email: signerEmail, today }),
  );
  const [signatures, setSignatures] = useState<FieldSignatures>({});
  const [adopted, setAdopted] = useState<Partial<Record<'signature' | 'initials', SignatureValue>>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [problem, setProblem] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ id: string; n: number } | null>(null);

  useEffect(() => {
    setValues((v) => syncLockedValues(template.fields, v, identity));
  }, [identity, template.fields]);

  useEffect(() => {
    if (!scrollTarget) return;
    const field = ordered.find((f) => f.id === scrollTarget.id);
    if (!field) return;
    const frame = requestAnimationFrame(() => pdfRef.current?.scrollToRect(field.page, field));
    return () => cancelAnimationFrame(frame);
  }, [scrollTarget, zoom, ordered]);

  const remaining = missingRequired(template.fields, values, signatures);
  const currentIndex = required.findIndex((f) => f.id === currentId);
  const current = currentIndex >= 0 ? required[currentIndex] : undefined;
  const signingField = ordered.find((f) => f.id === signingId);

  const goTo = useCallback(
    (field: Field) => {
      setCurrentId(field.id);
      if (isMobile) {
        const g = pdfRef.current?.getGeometry(field.page);
        if (g) {
          const widthAtOne = pdfRectToScreen(g, field).width / zoom;
          const wanted = Math.min(MAX_ZOOM, Math.max(1, MOBILE_MIN_FIELD_PX / widthAtOne));
          setZoom(Math.round(wanted * 100) / 100);
        }
      }
      setScrollTarget((prev) => ({ id: field.id, n: (prev?.n ?? 0) + 1 }));
    },
    [isMobile, zoom],
  );

  const scrollToPanel = () => {
    setZoom(1);
    panelRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };

  const next = () => {
    if (required.length === 0) return scrollToPanel();
    const start = currentIndex + 1;
    const rotated = [...required.slice(start), ...required.slice(0, start)];
    const target = rotated.find((f) => !isFieldFilled(f, values, signatures));
    if (!target) return scrollToPanel();
    goTo(target);
  };

  const prev = () => {
    if (required.length === 0) return;
    const index = currentIndex <= 0 ? required.length - 1 : currentIndex - 1;
    const target = required[index];
    if (target) goTo(target);
  };

  const startSigning = (field: Field) => {
    setCurrentId(field.id);
    const kind = field.type === 'initials' ? 'initials' : 'signature';
    const reuse = adopted[kind];
    if (reuse && !signatures[field.id]) {
      setSignatures((s) => ({ ...s, [field.id]: reuse }));
      return;
    }
    setSigningId(field.id);
  };

  const adopt = (value: SignatureValue) => {
    if (!signingField) return;
    const kind = signingField.type === 'initials' ? 'initials' : 'signature';
    setAdopted((a) => ({ ...a, [kind]: value }));
    setSignatures((s) => ({ ...s, [signingField.id]: value }));
    setSigningId(null);
    setProblem(null);
  };

  const submit = () => {
    if (!signerName.trim()) {
      setProblem(text.needName);
      return;
    }
    const first = remaining[0];
    if (first) {
      setProblem(text.missingFields);
      goTo(first);
      return;
    }
    if (!consent) {
      setProblem(text.needConsent);
      return;
    }
    setProblem(null);
    onSubmit(buildSignBody(template.fields, signerName, values, signatures));
  };

  const filledCount = required.length - remaining.length;
  const stepLabel = current
    ? `${text.fieldProgress
        .replace('{current}', String(currentIndex + 1))
        .replace('{total}', String(required.length))} · ${fieldLabel(current, locale, text)}`
    : remaining.length === 0
      ? text.allFieldsDone
      : text.fieldsRemaining.replace('{count}', String(remaining.length));

  return (
    <div className="grid items-start gap-4 pb-24 md:grid-cols-[minmax(0,1fr)_280px] md:pb-0">
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={text.zoomOut}
            disabled={zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
          >
            −
          </Button>
          <span className="w-12 text-center font-mono text-xs text-slate">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={text.zoomIn}
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.25) * 100) / 100))}
          >
            +
          </Button>
        </div>
        <div
          data-testid="signer-scroller"
          className="max-h-[calc(100vh-11rem)] overflow-auto rounded-lg bg-sunken p-2 sm:p-4"
        >
          <PdfPages
            ref={pdfRef}
            source={sourceUrl}
            zoom={zoom}
            className="!items-stretch"
            pageClassName="mx-auto"
            renderOverlay={({ pageNumber, geometry }) =>
              ordered
                .filter((f) => f.page === pageNumber)
                .map((field) => (
                  <FieldOverlay
                    key={field.id}
                    field={field}
                    label={fieldLabel(field, locale, text)}
                    geometry={geometry}
                    value={values[field.id]}
                    signature={signatures[field.id]}
                    active={field.id === currentId}
                    text={text}
                    onFocus={() => setCurrentId(field.id)}
                    onChange={(v) => {
                      setValues((s) => ({ ...s, [field.id]: v }));
                      setProblem(null);
                    }}
                    onSign={() => startSigning(field)}
                  />
                ))
            }
          />
        </div>
      </div>

      <div ref={panelRef} className="flex flex-col gap-4 md:sticky md:top-4">
        <div className="hidden flex-col gap-2 rounded-lg border border-grey/60 bg-surface p-4 md:flex">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate">{text.fieldsTitle}</h2>
          <p className="text-sm text-ink">{stepLabel}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={prev} disabled={required.length === 0}>
              ← {text.prevField}
            </Button>
            <Button variant="secondary" size="sm" onClick={next}>
              {text.nextField} →
            </Button>
          </div>
          <p className="text-xs text-slate">
            {text.fieldProgress
              .replace('{current}', String(filledCount))
              .replace('{total}', String(required.length))}
          </p>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-grey/60 bg-surface p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signer-legal-name" className="text-sm font-medium text-navy">
              {text.fullLegalName}
              <span className="ml-0.5 text-red">*</span>
            </label>
            <Input
              id="signer-legal-name"
              value={signerName}
              autoComplete="name"
              maxLength={120}
              onChange={(e) => setSignerName(e.target.value)}
              aria-describedby="signer-legal-name-hint"
            />
            <p id="signer-legal-name-hint" className="text-xs text-slate">
              {text.fullLegalNameHint}
            </p>
          </div>
          <ConsentBlock checked={consent} onChange={setConsent} label={text.consentLabel} />
          {(problem || submitError) && <Banner tone="error">{problem ?? submitError}</Banner>}
          <Button onClick={submit} loading={submitting}>
            {text.submit}
          </Button>
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-grey/60 bg-surface px-3 py-2 md:hidden"
        data-testid="mobile-stepper"
      >
        <Button variant="ghost" size="sm" onClick={prev} aria-label={text.prevField} disabled={required.length === 0}>
          ←
        </Button>
        <span className="min-w-0 flex-1 truncate text-center text-sm text-ink" aria-live="polite">
          {stepLabel}
        </span>
        <Button size="sm" onClick={next}>
          {text.nextField} →
        </Button>
      </div>

      <SignatureModal
        open={Boolean(signingField)}
        kind={signingField?.type === 'initials' ? 'initials' : 'signature'}
        text={text}
        defaultTypedText={signingField?.type === 'initials' ? initialsOf(signerName) : signerName}
        onAdopt={adopt}
        onClose={() => setSigningId(null)}
      />
    </div>
  );
}

