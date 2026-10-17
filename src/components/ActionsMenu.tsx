import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/**
 * One entry in an {@link ActionsMenu}. Give it `onSelect` for an action or
 * `to` for a router link. `description` is shown under the label and read
 * as its description, e.g. why it is disabled. `variant` only applies when
 * {@link RowActions} renders a lone item as a plain button.
 */
export interface ActionsMenuItem {
  key: string;
  label: string;
  ariaLabel?: string;
  onSelect?: () => void;
  to?: string;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  description?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}

interface MenuPosition {
  top: number;
  left: number;
  maxHeight: number;
}

const GAP = 4;
const MARGIN = 8;

/**
 * Places a menu against its trigger in viewport coordinates: right-aligned
 * below it, flipped above when it does not fit below and there is more room
 * above, and kept inside the viewport.
 */
export function placeMenu(
  trigger: Pick<DOMRect, 'top' | 'bottom' | 'right'>,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): MenuPosition {
  const left = Math.max(
    MARGIN,
    Math.min(trigger.right - menu.width, viewport.width - menu.width - MARGIN),
  );
  const below = viewport.height - trigger.bottom - GAP - MARGIN;
  const above = trigger.top - GAP - MARGIN;
  if (menu.height <= below || below >= above)
    return { top: trigger.bottom + GAP, left, maxHeight: Math.max(below, 0) };
  const height = Math.min(menu.height, above);
  return { top: trigger.top - GAP - height, left, maxHeight: above };
}

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusBeside(trigger: HTMLElement | null, step: 1 | -1) {
  if (!trigger) return;
  const all = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) =>
      el === trigger || (el.tabIndex >= 0 && !el.closest('[role="menu"]')),
  );
  (all[all.indexOf(trigger) + step] ?? trigger).focus();
}

function DotsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-5 w-5"
      fill="currentColor"
    >
      <circle cx="4" cy="10" r="1.75" />
      <circle cx="10" cy="10" r="1.75" />
      <circle cx="16" cy="10" r="1.75" />
    </svg>
  );
}

function ItemSpinner() {
  return (
    <span
      aria-hidden
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

/**
 * Three-dots button that opens a menu of row actions. The menu renders in a
 * portal positioned against the button, so table and overflow containers do
 * not clip it. Keyboard: Enter, Space or ArrowDown opens on the first item,
 * ArrowUp on the last; arrows, Home, End and typing a letter move; Escape
 * closes and returns focus to the button; Tab closes and moves on.
 */
export function ActionsMenu({
  items,
  label,
  id,
  busy,
  className,
}: {
  items: ActionsMenuItem[];
  label?: string;
  id?: string;
  busy?: boolean;
  className?: string;
}) {
  const t = useT();
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const menuId = `${generatedId}-menu`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [open, setOpen] = useState<'first' | 'last' | null>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const working = busy ?? items.some((item) => item.loading);

  const close = useCallback((refocus: boolean) => {
    setOpen(null);
    setPosition(null);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      setPosition(
        placeMenu(
          trigger.getBoundingClientRect(),
          { width: menu.offsetWidth, height: menu.scrollHeight },
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
  }, [open]);

  const placed = position !== null;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!open || !placed) return;
    const enabled = itemsRef.current
      .map((item, index) => (item.disabled || item.loading ? -1 : index))
      .filter((index) => index >= 0);
    const target =
      open === 'last' ? enabled[enabled.length - 1] : (enabled[0] ?? 0);
    itemRefs.current[target ?? 0]?.focus();
  }, [open, placed]);

  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) =>
      target instanceof Node &&
      !menuRef.current?.contains(target) &&
      !triggerRef.current?.contains(target);
    const onPointer = (e: Event) => {
      if (outside(e.target)) close(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('focusin', onPointer);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('focusin', onPointer);
    };
  }, [open, close]);

  function focusItem(index: number) {
    const count = items.length;
    itemRefs.current[(index + count) % count]?.focus();
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex(
      (el) => el === document.activeElement,
    );
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(current < 0 ? -1 : current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(items.length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      close(false);
      focusBeside(triggerRef.current, e.shiftKey ? -1 : 1);
    } else if (
      e.key.length === 1 &&
      e.key !== ' ' &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      const key = e.key.toLowerCase();
      const order = items.map((_, i) => (current + 1 + i) % items.length);
      const match = order.find((i) =>
        items[i]?.label.toLowerCase().startsWith(key),
      );
      if (match !== undefined) focusItem(match);
    }
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(e.key === 'ArrowDown' ? 'first' : 'last');
    }
  }

  function select(item: ActionsMenuItem) {
    close(true);
    item.onSelect?.();
  }

  const triggerLabel = label ?? t.common.moreActions;

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        data-actions-menu-trigger
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open ? menuId : undefined}
        aria-busy={working || undefined}
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-navy',
          'transition-colors duration-200 ease-brand hover:bg-navy-tint aria-expanded:bg-navy-tint',
          className,
        )}
        onClick={() => (open ? close(false) : setOpen('first'))}
        onKeyDown={onTriggerKeyDown}
      >
        {working ? <ItemSpinner /> : <DotsIcon />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              maxHeight: position?.maxHeight,
              visibility: position ? undefined : 'hidden',
            }}
            className="fixed z-50 flex min-w-[12rem] max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-md border border-grey/60 bg-surface py-1 shadow-pop"
          >
            {items.map((item, index) => (
              <MenuItem
                key={item.key}
                item={item}
                itemRef={(el) => {
                  itemRefs.current[index] = el;
                }}
                onSelect={() => select(item)}
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function MenuItem({
  item,
  itemRef,
  onSelect,
}: {
  item: ActionsMenuItem;
  itemRef: (el: HTMLElement | null) => void;
  onSelect: () => void;
}) {
  const descriptionId = useId();
  const inactive = item.disabled || item.loading;
  const className = cn(
    'flex min-h-[2.75rem] w-full flex-col items-start justify-center gap-0.5 px-4 py-2 text-left text-sm outline-none sm:min-h-[2.25rem]',
    'text-ink hover:bg-navy-tint focus:bg-navy-tint',
    item.destructive && 'text-status-rejected',
    inactive &&
      'cursor-not-allowed text-slate hover:bg-transparent focus:bg-sunken',
  );
  const content = (
    <>
      <span className="flex items-center gap-2">
        {item.loading && <ItemSpinner />}
        {item.label}
      </span>
      {item.description && (
        <span id={descriptionId} className="text-xs text-slate">
          {item.description}
        </span>
      )}
    </>
  );
  const shared = {
    role: 'menuitem',
    tabIndex: -1,
    'aria-label': item.ariaLabel ?? (item.description ? item.label : undefined),
    'aria-describedby': item.description ? descriptionId : undefined,
    className,
  } as const;

  if (item.to && !inactive)
    return (
      <Link
        {...shared}
        ref={itemRef}
        to={item.to}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === ' ') {
            e.preventDefault();
            e.currentTarget.click();
          }
        }}
      >
        {content}
      </Link>
    );
  return (
    <button
      {...shared}
      ref={itemRef}
      type="button"
      aria-disabled={inactive || undefined}
      aria-busy={item.loading || undefined}
      onClick={() => {
        if (!inactive) onSelect();
      }}
    >
      {content}
    </button>
  );
}

/**
 * Per-row actions: nothing for no items, a plain button (or link) for one,
 * and an {@link ActionsMenu} for two or more.
 */
export function RowActions({
  items,
  label,
  id,
  className,
}: {
  items: ActionsMenuItem[];
  label?: string;
  id?: string;
  className?: string;
}) {
  const [only, ...rest] = items;
  if (!only) return null;
  if (rest.length > 0)
    return (
      <ActionsMenu items={items} label={label} id={id} className={className} />
    );
  if (only.to && !only.disabled)
    return (
      <Link
        id={id}
        to={only.to}
        aria-label={only.ariaLabel}
        onClick={only.onSelect}
        className={cn(
          'inline-flex h-9 items-center rounded-md border border-navy px-3 text-sm font-medium text-navy hover:bg-navy-tint',
          className,
        )}
      >
        {only.label}
      </Link>
    );
  return (
    <Button
      id={id}
      size="sm"
      variant={only.variant ?? 'secondary'}
      loading={only.loading}
      disabled={only.disabled}
      title={only.description}
      aria-label={only.ariaLabel}
      className={className}
      onClick={only.onSelect}
    >
      {only.label}
    </Button>
  );
}
