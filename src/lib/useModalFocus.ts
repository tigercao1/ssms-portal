import { useEffect, useRef, type RefObject } from 'react';

export const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const openPanels: HTMLElement[] = [];

function tabbables(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => el.tabIndex >= 0 && !el.closest('[hidden], [inert]'),
  );
}

function focusFirst(candidates: HTMLElement[]) {
  return candidates.some((el) => {
    el.focus();
    return document.activeElement === el;
  });
}

function trapTab(e: KeyboardEvent, panel: HTMLElement) {
  const items = tabbables(panel);
  const active = document.activeElement;
  const edge = e.shiftKey ? items[0] : items[items.length - 1];
  if (active !== panel && active !== edge && panel.contains(active)) return;
  e.preventDefault();
  if (!focusFirst(e.shiftKey ? items.reverse() : items)) panel.focus();
}

function makeBackgroundInert(panel: HTMLElement) {
  const background = [...document.body.children].filter(
    (el) => !el.contains(panel) && !el.hasAttribute('inert'),
  );
  background.forEach((el) => el.setAttribute('inert', ''));
  return () => background.forEach((el) => el.removeAttribute('inert'));
}

export function useModalFocus(
  panelRef: RefObject<HTMLElement>,
  {
    open = true,
    onEscape,
    initialFocus,
  }: {
    open?: boolean;
    onEscape: () => void;
    initialFocus?: (panel: HTMLElement) => HTMLElement | null;
  },
) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const restoreBackground = makeBackgroundInert(panel);
    openPanels.push(panel);
    (initialFocusRef.current?.(panel) ?? panel).focus();
    const onKey = (e: KeyboardEvent) => {
      if (openPanels[openPanels.length - 1] !== panel) return;
      if (e.key === 'Escape') escapeRef.current();
      else if (e.key === 'Tab') trapTab(e, panel);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openPanels.splice(openPanels.indexOf(panel), 1);
      restoreBackground();
      previous?.focus?.();
    };
  }, [open, panelRef]);
}
