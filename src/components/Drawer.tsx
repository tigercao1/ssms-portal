import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';

export function Drawer({
  title,
  back,
  onClose,
  closeLabel,
  blocked = false,
  fullWidth = false,
  footer,
  children,
}: {
  title: ReactNode;
  back?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  blocked?: boolean;
  fullWidth?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !blockedRef.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('overflow-hidden');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('overflow-hidden');
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        data-testid="drawer-scrim"
        className="absolute inset-0 bg-ink/45"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 flex flex-col bg-canvas shadow-pop focus:outline-none',
          fullWidth ? 'w-full' : 'w-[min(580px,100vw)]',
        )}
      >
        <div className="flex items-center gap-2 border-b border-grey/60 bg-surface py-2 pl-4 pr-2.5">
          {back}
          <h2
            id={titleId}
            className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[19px]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel ?? t.common.close}
            className="grid h-10 w-10 flex-none place-items-center rounded-md border border-grey/60 text-xl leading-none text-slate hover:border-red hover:text-red"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">
          {children}
        </div>
        {footer && (
          <div
            data-testid="dock"
            className="flex flex-wrap items-center justify-between gap-2.5 border-t border-grey/60 bg-surface px-4 py-2.5"
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
