export const PAGE_URL_MAX = 500;
export const VIEWPORT_MAX = 32;
export const USER_AGENT_MAX = 300;

export interface ReportEnvironment {
  pageUrl: string;
  viewport: string;
  userAgent: string;
}

export function pageUrlWithoutQueryValues(
  location: Pick<Location, 'origin' | 'pathname' | 'search'>,
): string {
  const keys = [...new Set(new URLSearchParams(location.search).keys())];
  const query = keys.length
    ? `?${keys.map((key) => encodeURIComponent(key)).join('&')}`
    : '';
  return `${location.origin}${location.pathname}${query}`.slice(
    0,
    PAGE_URL_MAX,
  );
}

export function collectEnvironment(win: Window = window): ReportEnvironment {
  return {
    pageUrl: pageUrlWithoutQueryValues(win.location),
    viewport: `${win.innerWidth}x${win.innerHeight}`.slice(0, VIEWPORT_MAX),
    userAgent: win.navigator.userAgent.slice(0, USER_AGENT_MAX),
  };
}
