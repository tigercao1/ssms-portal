import { useEffect, useState } from 'react';

export const DESKTOP_QUERY = '(min-width: 861px)';

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => !!window.matchMedia?.(DESKTOP_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_QUERY);
    if (!mq) return;
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return desktop;
}
