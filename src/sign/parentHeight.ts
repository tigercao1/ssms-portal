import { useEffect, type RefObject } from 'react';

export const PARENT_ORIGIN = 'https://ssnow.club';
export const HEIGHT_MESSAGE_TYPE = 'ssnow-sign-height';

export function useParentHeight(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element || window.parent === window) return;
    const post = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      window.parent.postMessage(
        { type: HEIGHT_MESSAGE_TYPE, height },
        PARENT_ORIGIN,
      );
    };
    post();
    window.addEventListener('load', post);
    window.addEventListener('resize', post);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(post);
    observer?.observe(element);
    return () => {
      window.removeEventListener('load', post);
      window.removeEventListener('resize', post);
      observer?.disconnect();
    };
  }, [ref]);
}
