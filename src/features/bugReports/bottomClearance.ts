import { useEffect, useState, type RefObject } from 'react';

const SAMPLE_INSETS = [12, 56];
const MAX_BAR_SHARE = 0.4;

function pinnedBar(el: Element, self: Element | null): Element | null {
  for (
    let node: Element | null = el;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (self && (self.contains(node) || node.contains(self))) return null;
    const { position } = getComputedStyle(node);
    if (position !== 'fixed' && position !== 'sticky') continue;
    const rect = node.getBoundingClientRect();
    return rect.height < window.innerHeight * MAX_BAR_SHARE ? node : null;
  }
  return null;
}

export function bottomBarHeight(self: Element | null): number {
  if (typeof document.elementsFromPoint !== 'function') return 0;
  const { innerWidth, innerHeight } = window;
  let top = innerHeight;
  for (const inset of SAMPLE_INSETS) {
    for (const el of document.elementsFromPoint(
      innerWidth - inset,
      innerHeight - 2,
    )) {
      const bar = pinnedBar(el, self);
      if (bar) top = Math.min(top, bar.getBoundingClientRect().top);
    }
  }
  return Math.max(0, Math.round(innerHeight - top));
}

export function useBottomClearance(ref: RefObject<Element>): number {
  const [clearance, setClearance] = useState(0);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setClearance(bottomBarHeight(ref.current)),
      );
    };
    measure();
    window.addEventListener('scroll', measure, {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', measure);
    const observer = new MutationObserver(measure);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [ref]);

  return clearance;
}
