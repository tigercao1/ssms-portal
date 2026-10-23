export const POSTHOG_PROXY_PATH = '/snr';
export const POSTHOG_API_ORIGIN = 'https://us.i.posthog.com';
export const POSTHOG_ASSETS_ORIGIN = 'https://us-assets.i.posthog.com';
export const POSTHOG_UI_HOST = 'https://us.posthog.com';

const ASSET_PATH_PREFIXES = ['/static/', '/array/'];

const BLOCKLISTED_SCRIPT_ALIASES: ReadonlyArray<[string, string]> = [
  ['posthog-recorder.js', 'snr-rc.js'],
  ['dead-clicks-autocapture.js', 'snr-dc.js'],
];

export interface PosthogUpstream {
  url: string;
  isAsset: boolean;
}

function renameFile(path: string, from: string, to: string): string | null {
  return path.endsWith(`/${from}`)
    ? `${path.slice(0, -from.length)}${to}`
    : null;
}

export function posthogUpstreamPath(pathname: string): string | null {
  if (pathname === POSTHOG_PROXY_PATH) return '/';
  if (!pathname.startsWith(`${POSTHOG_PROXY_PATH}/`)) return null;
  const path = pathname.slice(POSTHOG_PROXY_PATH.length);
  for (const [original, alias] of BLOCKLISTED_SCRIPT_ALIASES) {
    const restored = renameFile(path, alias, original);
    if (restored) return restored;
  }
  return path;
}

export function posthogUpstream(url: URL): PosthogUpstream | null {
  const path = posthogUpstreamPath(url.pathname);
  if (path === null) return null;
  const isAsset = ASSET_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
  const origin = isAsset ? POSTHOG_ASSETS_ORIGIN : POSTHOG_API_ORIGIN;
  return { url: `${origin}${path}${url.search}`, isAsset };
}

export function aliasBlocklistedScript(src: string): string {
  const url = new URL(src, 'http://placeholder.invalid');
  if (posthogUpstreamPath(url.pathname) === null) return src;
  for (const [original, alias] of BLOCKLISTED_SCRIPT_ALIASES) {
    const renamed = renameFile(url.pathname, original, alias);
    if (renamed) return src.replace(url.pathname, renamed);
  }
  return src;
}
