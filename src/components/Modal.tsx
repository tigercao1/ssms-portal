import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';

/** Centered modal dialog: Escape and the backdrop close it; focus moves in and back. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([data-modal-close])',
    );
    (first ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_srgb,var(--ink)_40%,transparent)] p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'flex max-h-[90vh] w-full flex-col',
          size === 'lg' ? 'max-w-3xl' : 'max-w-lg',
          'rounded-t-lg bg-surface shadow-pop sm:rounded-lg',
        )}
      >
        <div className="flex items-center justify-between border-b border-grey/60 px-5 py-4">
          <h2 id={titleId} className="text-lg">
            {title}
          </h2>
          <button
            type="button"
            data-modal-close
            onClick={onClose}
            aria-label={t.common.close}
            className="rounded-md p-1.5 text-slate hover:bg-navy-tint hover:text-navy"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-grey/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
