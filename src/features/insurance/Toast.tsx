import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

export const TOAST_MS = 4000;

export function useToast({ topOnPhones = false } = {}) {
  const [message, setMessage] = useState<string | null>(null);
  const [serial, setSerial] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    setSerial((n) => n + 1);
    timer.current = setTimeout(() => setMessage(null), TOAST_MS);
  }, []);

  const node = message
    ? createPortal(
        <div
          key={serial}
          role="status"
          data-private
          className={cn(
            'fixed inset-x-4 z-[60] mx-auto max-w-sm break-words rounded-md border-l-[3px] border-l-status-approved bg-navy px-4 py-3 text-sm text-white shadow-pop',
            topOnPhones
              ? 'top-4 min-[861px]:bottom-4 min-[861px]:left-auto min-[861px]:right-6 min-[861px]:top-auto min-[861px]:mx-0'
              : 'bottom-4 sm:left-auto sm:right-6 sm:mx-0',
          )}
        >
          {message}
        </div>,
        document.body,
      )
    : null;

  return { toast: node, showToast: show };
}
