import type { CaptureResult, PostHog, PostHogConfig } from 'posthog-js';
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

function stripUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    return MASKED;
  }
  return url.origin + sanitizePath(url.pathname);
}

export function stripRequestUrl<T extends { name: string }>(request: T): T {
  return { ...request, name: stripUrl(request.name) };
}

const HTTP_URL = /\bhttps?:\/\/[^\s"'<>()]+/gi;
const LOCATION_IN_TEXT = new RegExp(
  `(${HTTP_URL.source}|(?:${STATIC_PREFIXES.join('|')})[^\\s"'<>()]*)`,
  'i',
);
const URL_PARAM = /([?#&])([\w.%-]+)=[^\s&#"'<>()]*/g;
const BEARER = /\b(bearer)\s+[\w.~+/-]+=*/gi;
const SENSITIVE_NAME = String.raw`[\w.-]*(?:token|secret|passw(?:or)?d|pwd|api[_-]?key|authorization|signature)|(?:t|code|otp|pass|key|auth|session|sig|sid)(?![\w.-])`;
const PAIR_SEPARATOR = String.raw`\s*(?:=|:(?!\d{1,5}\/))\s*`;
const QUOTED_VALUE = String.raw`(\\?["'])(?:(?!\5).)*\5`;
const BARE_VALUE = String.raw`\\?["']?(?:(?:bearer|basic)\s+)?[^\s"'&,;<>(){}[\]\\]+`;
const SENSITIVE_PAIR = new RegExp(
  String.raw`(^|[^\w.-])(\\?["']?)(?=${SENSITIVE_NAME})(?=([\w.-]+))\3(\2${PAIR_SEPARATOR})(?:${QUOTED_VALUE}|${BARE_VALUE})`,
  'gi',
);
const SENSITIVE_KEY = new RegExp(
  String.raw`^(?=${SENSITIVE_NAME})[\w.-]+$`,
  'i',
);
const EMAIL = /(^|[^\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const JWT = /\beyJ[\w-]*\.[\w-]+\.[\w-]*/g;
const SECRET_CANDIDATE = /[\w-]{6,}/g;
const LOCATION_KEYS = new Set(['filename', 'abs_path', 'url']);

function maskSecret(candidate: string): string {
  return (candidate.length >= 32 || /\d{6}/.test(candidate)) &&
    !IS_UUID.test(candidate)
    ? '[token]'
    : candidate;
}

function redactSecrets(text: string): string {
  return text
    .replace(URL_PARAM, `$1$2=${MASKED}`)
    .replace(BEARER, `$1 ${MASKED}`)
    .replace(SENSITIVE_PAIR, `$1$2$3$4$5${MASKED}$5`)
    .replace(EMAIL, '$1[email]')
    .replace(JWT, '[token]')
    .replace(SECRET_CANDIDATE, maskSecret);
}

function stripLocation(value: string): string {
  return value.replace(HTTP_URL, stripUrl).replace(/[?#].*/, '');
}

function isBundleLocation(location: string): boolean {
  const path = location.replace(/^[a-z][\w+.-]*:\/\/[\w.-]*(?::\d+)?/i, '');
  return (
    STATIC_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
    /^(?:[\w.-]|\/@?)*$/.test(path)
  );
}

function redactLocation(value: string): string {
  const location = stripLocation(value);
  return isBundleLocation(location) ? location : redactSecrets(location);
}

export function redactText(text: string): string {
  return text
    .split(LOCATION_IN_TEXT)
    .map((part, index) =>
      index % 2 ? redactLocation(part) : redactSecrets(part),
    )
    .join('');
}

function redactValue(value: unknown, key = ''): unknown {
  if (
    SENSITIVE_KEY.test(key) &&
    (typeof value === 'string' || typeof value === 'number')
  )
    return MASKED;
  if (typeof value === 'string')
    return LOCATION_KEYS.has(key) ? redactLocation(value) : redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        redactValue(item, name),
      ]),
    );
  return value;
}

export function redactExceptionEvent(
  event: CaptureResult,
): CaptureResult | null {
  if (event.event !== '$exception') return event;
  try {
    return {
      ...event,
      properties: Object.fromEntries(
        Object.entries(event.properties).map(([name, value]) => [
          name,
          name.startsWith('$exception') ? redactValue(value) : value,
        ]),
      ),
    };
  } catch {
    return null;
  }
}

export const posthogConfig: Partial<PostHogConfig> = {
  defaults: '2026-08-30',
  person_profiles: 'identified_only',
  disable_capture_url_hashes: true,
  mask_personal_data_properties: true,
  custom_personal_data_properties: ['t', 'token', 'token_hash', 'code'],
  capture_exceptions: true,
  before_send: redactExceptionEvent,
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
