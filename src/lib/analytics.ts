import type { CaptureResult, PostHog, PostHogConfig } from 'posthog-js';
import { env } from './env';
import {
  aliasBlocklistedScript,
  POSTHOG_PROXY_PATH,
  POSTHOG_UI_HOST,
} from './posthogProxy';

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

type Fields = Record<string, unknown>;
type Check = (value: unknown) => unknown;

const SENSITIVE_URL_PARAMS = ['t', 'token', 'token_hash', 'code'];
const SENSITIVE_URL_PARAM = new RegExp(
  `([?&#](?:${SENSITIVE_URL_PARAMS.join('|')})=)[^&#]*`,
  'g',
);
const MASKED_URL_PARAM = '$1<masked>';
const URL_PROPERTIES = new Set([
  '$current_url',
  '$referrer',
  '$session_entry_url',
  '$session_entry_referrer',
  '$initial_current_url',
  '$initial_referrer',
]);
const PERSON_PROPERTIES = new Set(['$set', '$set_once']);

const REDACTED = '[redacted]';
const MAX_MESSAGE_LENGTH = 200;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ERROR_NAME_PREFIX = /^([A-Za-z]+): /;
const STANDARD_ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'EvalError',
  'URIError',
  'AggregateError',
  'NotFoundError',
  'NotAllowedError',
  'AbortError',
  'NetworkError',
  'SecurityError',
  'InvalidStateError',
  'QuotaExceededError',
  'NotSupportedError',
  'DataCloneError',
  'TimeoutError',
  'HierarchyRequestError',
  'InvalidCharacterError',
  'ChunkLoadError',
]);
const SAFE_TEXT = /^[A-Za-z .,'()!?-]*$/;
const LONG_WORD = /[^ ]{25}/;
const BUNDLE_PATH = /^[A-Za-z0-9._/-]+$/;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null;
}

function maskUrls(fields: Fields): Fields {
  let masked = fields;
  for (const [name, value] of Object.entries(fields)) {
    const safe =
      typeof value === 'string' && URL_PROPERTIES.has(name)
        ? value.replace(SENSITIVE_URL_PARAM, MASKED_URL_PARAM)
        : PERSON_PROPERTIES.has(name) && isFields(value)
          ? maskUrls(value)
          : value;
    if (safe !== value) masked = { ...masked, [name]: safe };
  }
  return masked;
}

export function maskUrlProperties(event: CaptureResult): CaptureResult {
  const properties = maskUrls(event.properties);
  const $set = event.$set && maskUrls(event.$set);
  const $set_once = event.$set_once && maskUrls(event.$set_once);
  return properties === event.properties &&
    $set === event.$set &&
    $set_once === event.$set_once
    ? event
    : {
        ...event,
        properties,
        ...($set && { $set }),
        ...($set_once && { $set_once }),
      };
}

const flag: Check = (value) => (typeof value === 'boolean' ? value : undefined);

const count: Check = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const identifier: Check = (value) =>
  typeof value === 'string' && IDENTIFIER.test(value) ? value : undefined;

const oneOf =
  (...allowed: string[]): Check =>
  (value) =>
    typeof value === 'string' && allowed.includes(value) ? value : undefined;

function safeMessage(value: unknown, type: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_MESSAGE_LENGTH)
    return REDACTED;
  const name = ERROR_NAME_PREFIX.exec(value)?.[1];
  const text =
    name !== undefined &&
    STANDARD_ERROR_NAMES.has(name) &&
    (name === type || type === 'DOMException')
      ? value.slice(name.length + 2)
      : value;
  return SAFE_TEXT.test(text) && !LONG_WORD.test(text) ? value : REDACTED;
}

const bundleLocation: Check = (value) => {
  if (typeof value !== 'string') return undefined;
  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    return undefined;
  }
  return url.origin === window.location.origin &&
    STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) &&
    BUNDLE_PATH.test(url.pathname)
    ? url.origin + url.pathname
    : undefined;
};

const EVENT_FIELDS: Record<string, Check> = {
  $exception_level: oneOf('fatal', 'error', 'warning', 'log', 'info', 'debug'),
  $exception_capture_enabled_server_side: flag,
};
const MECHANISM_FIELDS: Record<string, Check> = {
  type: identifier,
  handled: flag,
  synthetic: flag,
  source: oneOf('cause', 'member'),
  exception_id: count,
  parent_id: count,
};
const FRAME_FIELDS: Record<string, Check> = {
  platform: oneOf('web:javascript', 'node:javascript', 'hermes'),
  function: identifier,
  filename: bundleLocation,
  abs_path: bundleLocation,
  lineno: count,
  colno: count,
  in_app: flag,
};

function pick(source: Fields, checks: Record<string, Check>): Fields {
  const picked: Fields = {};
  for (const [name, check] of Object.entries(checks)) {
    const value = check(source[name]);
    if (value !== undefined) picked[name] = value;
  }
  return picked;
}

function rebuildException(entry: Fields): Fields {
  const frames = isFields(entry.stacktrace)
    ? entry.stacktrace.frames
    : undefined;
  const type = identifier(entry.type) ?? 'Error';
  return {
    type,
    value: safeMessage(entry.value, type),
    ...(isFields(entry.mechanism) && {
      mechanism: pick(entry.mechanism, MECHANISM_FIELDS),
    }),
    ...(Array.isArray(frames) && {
      stacktrace: {
        type: 'raw',
        frames: frames
          .filter(isFields)
          .map((frame) => pick(frame, FRAME_FIELDS)),
      },
    }),
  };
}

export function redactExceptionEvent(
  event: CaptureResult,
): CaptureResult | null {
  if (event.event !== '$exception') return event;
  try {
    const list: unknown = event.properties.$exception_list;
    if (!Array.isArray(list) || !list.every(isFields)) return null;
    return {
      ...event,
      properties: {
        ...Object.fromEntries(
          Object.entries(event.properties).filter(
            ([name]) => !name.startsWith('$exception'),
          ),
        ),
        ...pick(event.properties, EVENT_FIELDS),
        $exception_list: list.map(rebuildException),
      },
    };
  } catch {
    return null;
  }
}

export const posthogConfig: Partial<PostHogConfig> = {
  defaults: '2026-08-30',
  api_host: POSTHOG_PROXY_PATH,
  ui_host: POSTHOG_UI_HOST,
  prepare_external_dependency_script: (script) => {
    script.src = aliasBlocklistedScript(script.src);
    return script;
  },
  person_profiles: 'identified_only',
  disable_capture_url_hashes: true,
  mask_personal_data_properties: true,
  custom_personal_data_properties: SENSITIVE_URL_PARAMS,
  capture_exceptions: true,
  before_send: [maskUrlProperties, redactExceptionEvent],
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
    posthog.init(env.posthogKey, posthogConfig);
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
