import type { PostHog } from 'posthog-js';
import { env } from './env';

export type AnalyticsRole = 'admin' | 'instructor';

let client: Promise<PostHog> | null = null;

export function initAnalytics(): void {
  if (!env.posthogKey || client) return;
  client = import('posthog-js').then(({ default: posthog }) => {
    posthog.init(env.posthogKey, {
      api_host: env.posthogHost,
      defaults: '2026-08-30',
      person_profiles: 'identified_only',
      disable_capture_url_hashes: true,
      mask_personal_data_properties: true,
      custom_personal_data_properties: ['t', 'token', 'token_hash', 'code'],
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
      },
    });
    return posthog;
  });
}

function withClient(run: (posthog: PostHog) => void): void {
  void client?.then(run);
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
