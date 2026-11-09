import { forwardRef, type ReactNode } from 'react';
import { ButtonSpinner, buttonClasses } from '@/components/Button';
import type { SignForm, SignOriginalPdf, SignPlacement } from './api';
import type { SignMessages } from './messages';
import { OriginalPdfStatus } from './OriginalDocument';
import { fitText, placementToPixels } from './pdf/geometry';
import { PdfPageView, type PageLayout } from './pdf/PdfPageView';
import type { OriginalPdf } from './pdf/useOriginalPdf';

export const OVERLAY_FONT =
  '"Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif';
const MEASURE_SIZE = 100;

let measureContext: CanvasRenderingContext2D | null | undefined;

function widthAtOnePixel(value: string) {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (typeof measureContext?.measureText !== 'function') return 0;
  measureContext.font = `${MEASURE_SIZE}px ${OVERLAY_FONT}`;
  return measureContext.measureText(value).width / MEASURE_SIZE;
}

interface ReviewStepProps {
  form: SignForm;
  info: SignOriginalPdf;
  pdf: OriginalPdf;
  text: SignMessages;
  answers: Record<string, string>;
  signatures: Record<string, string>;
  notice: ReactNode;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

function Placement({
  placement,
  layout,
  answer,
  signature,
  label,
}: {
  placement: SignPlacement;
  layout: PageLayout;
  answer: string;
  signature: string | null;
  label: string;
}) {
  const box = placementToPixels(layout.viewport.transform, placement);
  const position = {
    position: 'absolute' as const,
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
  };
  if (signature)
    return (
      <img
        src={signature}
        alt={label}
        className="object-contain"
        style={position}
      />
    );
  if (!answer) return null;
  const { fontSize, padding } = fitText(
    box,
    layout.scale,
    widthAtOnePixel(answer),
  );
  return (
    <span
      className="flex items-center overflow-hidden whitespace-nowrap leading-none text-ink"
      style={{
        ...position,
        fontSize,
        paddingLeft: padding,
        fontFamily: OVERLAY_FONT,
      }}
    >
      {answer}
    </span>
  );
}

export const ReviewStep = forwardRef<HTMLHeadingElement, ReviewStepProps>(
  function ReviewStep(
    {
      form,
      info,
      pdf,
      text,
      answers,
      signatures,
      notice,
      submitting,
      onBack,
      onConfirm,
    },
    headingRef,
  ) {
    const fields = new Map(form.fields.map((field) => [field.key, field]));
    const doc = pdf.state.status === 'ready' ? pdf.state.doc : null;
    const pageCount = doc?.numPages ?? info.pageCount;

    const overlays = (pageNumber: number) => (layout: PageLayout) =>
      info.placements
        .filter((placement) => placement.page === pageNumber)
        .map((placement, i) => {
          const field = fields.get(placement.key);
          if (!field) return null;
          return (
            <Placement
              key={`${placement.key}-${i}`}
              placement={placement}
              layout={layout}
              label={field.label}
              answer={
                field.type === 'signature' ? '' : (answers[field.key] ?? '')
              }
              signature={
                field.type === 'signature'
                  ? (signatures[field.key] ?? null)
                  : null
              }
            />
          );
        });

    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl leading-tight">{form.title}</h1>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold focus:outline-none"
        >
          {text.reviewHeading}
        </h2>
        <p
          role="note"
          className="rounded-md border border-navy bg-navy-tint px-3 py-2 text-sm font-medium text-navy"
        >
          {text.previewNotice}
        </p>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className={buttonClasses({
            variant: 'secondary',
            className: 'w-full',
          })}
        >
          {text.backToEdit}
        </button>
        <OriginalPdfStatus pdf={pdf} text={text} />
        {doc &&
          Array.from({ length: pageCount }, (_, i) => (
            <PdfPageView
              key={i + 1}
              doc={doc}
              pageNumber={i + 1}
              size={info.pages[i]}
              label={text.previewPageOf(i + 1, pageCount)}
            >
              {overlays(i + 1)}
            </PdfPageView>
          ))}
        {notice}
        <div className="sticky bottom-0 -mx-4 border-t border-grey bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6">
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={buttonClasses({ className: 'w-full' })}
          >
            {submitting && <ButtonSpinner />}
            {submitting ? text.submitting : text.confirm}
          </button>
        </div>
      </section>
    );
  },
);
