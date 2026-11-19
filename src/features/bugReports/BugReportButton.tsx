import { useRef, useState, type FocusEvent } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { useToast } from '@/features/insurance/Toast';
import { useBottomClearance } from './bottomClearance';
import { BugReportDialog } from './BugReportDialog';

const EDGE_GAP_PX = 16;

function BugIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 7.5V6a3 3 0 0 1 6 0v1.5" />
      <rect x="7" y="7.5" width="10" height="12" rx="5" />
      <path d="M12 11v8.5M3.5 13H7M17 13h3.5M4.5 8.5 7.5 10M19.5 8.5 16.5 10M4.5 18.5l3-2M19.5 18.5l-3-2" />
    </svg>
  );
}

function isKeyboardFocus(e: FocusEvent<HTMLElement>): boolean {
  try {
    return e.currentTarget.matches(':focus-visible');
  } catch {
    return true;
  }
}

export function BugReportButton() {
  const t = useT();
  const s = t.bugReport;
  const [open, setOpen] = useState(false);
  const [tooltip, setTooltip] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const clearance = useBottomClearance(wrapperRef);
  const { toast, showToast } = useToast({ topOnPhones: true });

  return (
    <>
      <div
        ref={wrapperRef}
        className="fixed right-4 z-40 transition-[bottom] duration-200 motion-reduce:transition-none"
        style={{
          bottom: `calc(${clearance + EDGE_GAP_PX}px + env(safe-area-inset-bottom))`,
        }}
      >
        <button
          type="button"
          aria-label={s.button}
          title={s.button}
          onClick={() => {
            setTooltip(false);
            setOpen(true);
          }}
          onMouseEnter={() => setTooltip(true)}
          onMouseLeave={() => setTooltip(false)}
          onFocus={(e) => setTooltip(isKeyboardFocus(e))}
          onBlur={() => setTooltip(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setTooltip(false);
          }}
          className="grid h-11 w-11 place-items-center rounded-full border border-grey/60 bg-surface text-navy shadow-pop hover:bg-navy-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          <BugIcon />
        </button>
        {tooltip && (
          <span
            role="tooltip"
            className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-navy px-2.5 py-1.5 text-xs text-white shadow-pop"
          >
            {s.button}
          </span>
        )}
      </div>
      {open && (
        <BugReportDialog
          onClose={() => setOpen(false)}
          onSent={() => {
            setOpen(false);
            showToast(s.thanks);
          }}
        />
      )}
      {toast}
    </>
  );
}
