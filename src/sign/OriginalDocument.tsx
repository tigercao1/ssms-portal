import { useId, useState } from 'react';
import { buttonClasses } from '@/components/Button';
import type { SignOriginalPdf } from './api';
import type { SignMessages } from './messages';
import { PdfPageView } from './pdf/PdfPageView';
import type { OriginalPdf } from './pdf/useOriginalPdf';

const navClass =
  'min-h-11 rounded-md px-3 text-sm font-medium text-navy hover:bg-navy-tint disabled:cursor-not-allowed disabled:opacity-40';

export function OriginalPdfStatus({
  pdf,
  text,
}: {
  pdf: OriginalPdf;
  text: SignMessages;
}) {
  if (pdf.state.status === 'loading')
    return (
      <p role="status" className="py-8 text-center text-sm text-slate">
        {text.pdfLoading}
      </p>
    );
  if (pdf.state.status !== 'error') return null;
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-md bg-red-tint px-4 py-5 text-center text-sm text-ink"
    >
      <p>{text.pdfFailed}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          onClick={pdf.retry}
        >
          {text.retry}
        </button>
        <a
          href={pdf.href}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: 'ghost', size: 'sm' })}
        >
          {text.pdfOpenInTab}
        </a>
      </div>
    </div>
  );
}

export function OriginalDocument({
  pdf,
  info,
  text,
}: {
  pdf: OriginalPdf;
  info: SignOriginalPdf | null;
  text: SignMessages;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const doc = pdf.state.status === 'ready' ? pdf.state.doc : null;
  const pageCount = doc?.numPages ?? info?.pageCount ?? 1;

  const toggle = () => {
    if (!open) pdf.open();
    setOpen(!open);
  };

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={buttonClasses({ variant: 'secondary', className: 'w-full' })}
      >
        {open ? text.hideOriginal : text.viewOriginal}
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={text.originalDocument}
          className="flex flex-col gap-3"
        >
          <OriginalPdfStatus pdf={pdf} text={text} />
          {doc && pageCount > 1 && (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className={navClass}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {text.previousPage}
              </button>
              <select
                aria-label={text.pageList}
                value={page}
                onChange={(event) => setPage(Number(event.target.value))}
                className="min-h-11 rounded-md border border-grey bg-white px-2 text-sm"
              >
                {Array.from({ length: pageCount }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {text.pageOf(i + 1, pageCount)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={navClass}
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                {text.nextPage}
              </button>
            </div>
          )}
          {doc && (
            <PdfPageView
              doc={doc}
              pageNumber={page}
              size={info?.pages[page - 1]}
              label={text.pageOf(page, pageCount)}
            />
          )}
        </div>
      )}
    </section>
  );
}
