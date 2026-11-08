import type { KeyboardEvent, ReactNode } from 'react';
import { Rnd } from 'react-rnd';
import { cn } from '@/lib/cn';
import type { ScreenRect } from '../../pdf/transforms';

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function arrowDelta(
  e: KeyboardEvent,
  scale: number,
): [number, number] | null {
  const dir = ARROWS[e.key];
  if (!dir) return null;
  const step = (e.shiftKey ? 10 : 1) * scale;
  return [dir[0] * step, dir[1] * step];
}

export function PlacedFieldBox({
  rect,
  editable,
  selected,
  icon,
  label,
  ariaLabel,
  elementRef,
  onSelect,
  onPlace,
  onKeyDown,
}: {
  rect: ScreenRect;
  editable: boolean;
  selected: boolean;
  icon: ReactNode;
  label: string;
  ariaLabel: string;
  elementRef?: (el: HTMLElement | null) => void;
  onSelect: () => void;
  onPlace: (left: number, top: number, width: number, height: number) => void;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  return (
    <Rnd
      bounds="parent"
      size={{ width: rect.width, height: rect.height }}
      position={{ x: rect.left, y: rect.top }}
      minWidth={4}
      minHeight={4}
      disableDragging={!editable}
      enableResizing={editable}
      onDragStart={onSelect}
      onDragStop={(_e, d) => onPlace(d.x, d.y, rect.width, rect.height)}
      onResizeStart={onSelect}
      onResizeStop={(_e, _dir, el, _delta, pos) =>
        onPlace(
          pos.x,
          pos.y,
          el.offsetWidth || Number.parseFloat(el.style.width),
          el.offsetHeight || Number.parseFloat(el.style.height),
        )
      }
      className={cn('group', selected ? 'z-20' : 'z-10')}
    >
      <div
        ref={elementRef}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={ariaLabel}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-full w-full cursor-move items-center gap-1 overflow-hidden rounded-sm border px-1 text-[11px] leading-none outline-none',
          selected
            ? 'border-red bg-red/10 text-red ring-2 ring-red/40'
            : 'border-navy/70 bg-navy-tint/80 text-navy hover:border-navy',
        )}
      >
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
    </Rnd>
  );
}
