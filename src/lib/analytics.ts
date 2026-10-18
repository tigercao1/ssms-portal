import type { PostHog, PostHogConfig } from 'posthog-js';
import { env } from './env';

export type AnalyticsRole = 'admin' | 'instructor';

const MASKED = '***';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

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

function maskUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    return MASKED;
  }
  if (url.origin !== window.location.origin) return MASKED;
  return url.pathname.replace(UUID, ':id');
}

export function maskReplayAttribute(
  name: string,
  value: string,
  element?: Element,
): string {
  const isPrivate = Boolean(element?.closest(PRIVATE_TEXT_SELECTOR));
  if (name === 'href' || name === 'src') {
    if (element?.tagName === 'LINK' && name === 'href') return value;
    return isPrivate ? MASKED : maskUrl(value);
  }
  if (isPrivate && (name === 'placeholder' || name === 'data-testid'))
    return MASKED;
  if (element instanceof SVGElement) return value;
  return VISIBLE_ATTRIBUTES.has(name) ? value : MASKED;
}

export function stripRequestUrl<T extends { name: string }>(request: T): T {
  return {
    ...request,
    name: request.name.split(/[?#]/)[0]!.replace(UUID, ':id'),
  };
}

export const posthogConfig: Partial<PostHogConfig> = {
  defaults: '2026-08-30',
  person_profiles: 'identified_only',
  disable_capture_url_hashes: true,
  mask_personal_data_properties: true,
  custom_personal_data_properties: ['t', 'token', 'token_hash', 'code'],
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
