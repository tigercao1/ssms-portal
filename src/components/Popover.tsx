import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { placeMenu } from './ActionsMenu';

interface Position {
  top: number;
  left: number;
  maxHeight: number;
}

export function Popover({
  id,
  label,
  triggerRef,
  onClose,
  className,
  children,
}: {
  id?: string;
  label: string;
  triggerRef: RefObject<HTMLElement>;
  onClose: (refocus: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      setPosition(
        placeMenu(
          trigger.getBoundingClientRect(),
          { width: panel.offsetWidth, height: panel.scrollHeight },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [triggerRef]);

  const placed = position !== null;
  useEffect(() => {
    if (!placed) return;
    panelRef.current
      ?.querySelector<HTMLElement>('input, button, a[href]')
      ?.focus();
  }, [placed]);

  useEffect(() => {
    const outside = (target: EventTarget | null) =>
      target instanceof Node &&
      !panelRef.current?.contains(target) &&
      !triggerRef.current?.contains(target);
    const onPointer = (e: Event) => {
      if (outside(e.target)) closeRef.current(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current(true);
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('focusin', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('focusin', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [triggerRef]);

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={label}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        maxHeight: position?.maxHeight,
        visibility: position ? undefined : 'hidden',
      }}
      className={cn(
        'fixed z-50 flex max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-md border border-grey/60 bg-surface shadow-pop',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
