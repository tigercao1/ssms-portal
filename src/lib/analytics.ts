import type { PostHog, PostHogConfig } from 'posthog-js';
import { env } from './env';

export type AnalyticsRole = 'admin' | 'instructor';

const MASKED = '***';
const VISIBLE_REPLAY_ATTRIBUTES = new Set([
  'class',
  'style',
  'id',
  'role',
  'type',
  'width',
  'height',
  'viewBox',
  'd',
  'fill',
  'stroke',
  'disabled',
  'checked',
  'aria-hidden',
  'aria-expanded',
  'aria-pressed',
  'aria-current',
]);

export function maskReplayAttribute(name: string, value: string): string {
  return VISIBLE_REPLAY_ATTRIBUTES.has(name) ? value : MASKED;
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
    maskTextSelector: '*',
    maskAttributeFn: maskReplayAttribute,
    blockSelector: 'img, canvas, picture, video',
    captureCanvas: { recordCanvas: false },
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
