import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const TOAST_MS = 4000;

export function useToast() {
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
          className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-sm rounded-md border-l-[3px] border-l-status-approved bg-navy px-4 py-3 text-sm text-white shadow-pop sm:left-auto sm:right-6 sm:mx-0"
        >
          {message}
        </div>,
        document.body,
      )
    : null;

  return { toast: node, showToast: show };
}
