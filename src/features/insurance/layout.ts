import { useMediaQuery } from '@/lib/useMediaQuery';

export const DESKTOP_QUERY = '(min-width: 861px)';

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
