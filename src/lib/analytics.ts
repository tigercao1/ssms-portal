import type { PostHog, PostHogConfig } from 'posthog-js';
import { env } from './env';

export type AnalyticsRole = 'admin' | 'instructor';

const MASKED = '***';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const IS_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PRIVATE_TEXT_SELECTOR =
  '[data-private], tbody:not([data-public]), dd:not([data-public]), select';
const PRIVATE_MEDIA_SELECTOR =
  '[data-private] img, img[data-private], tbody:not([data-public]) img, canvas, video, picture';

const VISIBLE_ATTRIBUTES = new Set([
  'class',
  'style',
  'id',
  'role',
  'type',
  'for',
  'name',
  'placeholder',
  'width',
  'height',
  'disabled',
  'checked',
  'selected',
  'open',
  'hidden',
  'tabindex',
  'colspan',
  'rowspan',
  'lang',
  'dir',
  'rel',
  'media',
  'crossorigin',
  'sizes',
  '_cssText',
  'rr_width',
  'rr_height',
  'data-testid',
  'aria-hidden',
  'aria-expanded',
  'aria-pressed',
  'aria-current',
  'aria-selected',
  'aria-checked',
  'aria-disabled',
  'aria-modal',
]);

const PRIVATE_SAFE_ATTRIBUTES = new Set([
  'class',
  'style',
  'role',
  'type',
  'width',
  'height',
  'hidden',
  'disabled',
  'checked',
  'colspan',
  'rowspan',
  'rr_width',
  'rr_height',
  'aria-hidden',
]);
const SAFE_SEGMENT = /^[a-z0-9._-]+$/;
const STATIC_PREFIXES = ['/assets/', '/pdfjs/', '/src/', '/node_modules/'];
const LAYOUT_LINK_RELS =
  /\b(stylesheet|icon|preconnect|preload|modulepreload)\b/;

export function sanitizePath(pathname: string): string {
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
    return pathname;
  return pathname
    .split('/')
    .map((segment) =>
      segment === '' || (SAFE_SEGMENT.test(segment) && !IS_UUID.test(segment))
        ? segment
        : ':id',
    )
    .join('/')
    .replace(UUID, ':id');
}

function maskUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    return MASKED;
  }
  if (url.origin !== window.location.origin) return MASKED;
  return sanitizePath(url.pathname);
}

export function maskReplayAttribute(
  name: string,
  value: string,
  element?: Element,
): string {
  if (element?.closest(PRIVATE_TEXT_SELECTOR))
    return PRIVATE_SAFE_ATTRIBUTES.has(name) ? value : MASKED;
  if (
    element?.tagName === 'LINK' &&
    LAYOUT_LINK_RELS.test(element.getAttribute('rel') ?? '')
  )
    return name === 'href' || VISIBLE_ATTRIBUTES.has(name) ? value : MASKED;
  if (name === 'href' || name === 'src') return maskUrl(value);
  if (element instanceof SVGElement) return value;
  return VISIBLE_ATTRIBUTES.has(name) ? value : MASKED;
}

export function stripRequestUrl<T extends { name: string }>(request: T): T {
  let url: URL;
  try {
    url = new URL(request.name, window.location.origin);
  } catch {
    return { ...request, name: MASKED };
  }
  return { ...request, name: url.origin + sanitizePath(url.pathname) };
}

export const posthogConfig: Partial<PostHogConfig> = {
  defaults: '2026-08-30',
  person_profiles: 'identified_only',
  disable_capture_url_hashes: true,
  mask_personal_data_properties: true,
  custom_personal_data_properties: ['t', 'token', 'token_hash', 'code'],
  capture_exceptions: true,
  mask_all_text: true,
  mask_all_element_attributes: true,
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: PRIVATE_TEXT_SELECTOR,
    maskAttributeFn: maskReplayAttribute,
    blockSelector: PRIVATE_MEDIA_SELECTOR,
    captureCanvas: { recordCanvas: false },
    recordHeaders: false,
    recordBody: false,
    maskCapturedNetworkRequestFn: stripRequestUrl,
  },
};

let client: Promise<PostHog> | null = null;

export function initAnalytics(): void {
  if (!env.posthogKey || client) return;
  client = import('posthog-js').then(({ default: posthog }) => {
    posthog.init(env.posthogKey, {
      ...posthogConfig,
      api_host: env.posthogHost,
    });
    return posthog;
  });
  client.catch(() => {
    client = null;
  });
}

function withClient(run: (posthog: PostHog) => void): void {
  client?.then(run).catch(() => undefined);
}

export function identifyUser(id: string, role: AnalyticsRole): void {
  withClient((posthog) => posthog.identify(id, { role }));
}

export function resetUser(): void {
  withClient((posthog) => posthog.reset());
}

export function track(
  event: string,
  properties?: Record<string, string | number | boolean>,
): void {
  withClient((posthog) => posthog.capture(event, properties));
}

export function captureError(error: unknown): void {
  withClient((posthog) => posthog.captureException(error));
}
