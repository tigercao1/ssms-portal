import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '@/lib/useModalFocus';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Modal dialog that is a bottom sheet on phones and a centred card on wider screens. */
export function Sheet({ open, title, onClose, children, footer }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, [open]);

  useModalFocus(panelRef, { open, onEscape: onClose });

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full flex-col rounded-t-lg bg-surface shadow-pop focus:outline-none sm:max-w-lg sm:rounded-lg"
      >
        <div className="px-5 pb-2 pt-4">
          <h2 id={titleId} className="text-lg font-semibold text-navy">
            {title}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-3">{children}</div>
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
