import posthog, { type CaptureResult } from 'posthog-js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { maskReplayAttribute, posthogConfig } from './analytics';

const events: CaptureResult[] = [];

beforeAll(() => {
  posthog.init('phc_test', {
    ...posthogConfig,
    api_host: 'http://posthog.invalid',
    disable_session_recording: true,
    advanced_disable_flags: true,
    before_send: (event) => {
      if (event) events.push(event);
      return null;
    },
  });
});

beforeEach(() => {
  events.length = 0;
});

describe('analytics privacy with the real SDK', () => {
  it('autocaptures a click on a name link without its text or attributes', async () => {
    document.body.innerHTML =
      '<a href="/admin/instructors/42" title="Jane Doe" aria-label="Jane Doe" class="row-link">Jane Doe</a>';
    document.querySelector('a')!.click();

    await new Promise((resolve) => setTimeout(resolve, 50));
    const click = events.find((e) => e.event === '$autocapture');
    expect(click).toBeDefined();
    expect(JSON.stringify(click)).not.toContain('Jane Doe');
  });

  it('drops auth tokens from the URL hash and masks the invite token', () => {
    window.history.pushState(
      {},
      '',
      '/activate?t=invite-secret#access_token=jwt-secret&refresh_token=refresh-secret',
    );
    posthog.capture('activation_completed');
    window.history.pushState({}, '', '/');

    const sent = JSON.stringify(events);
    expect(sent).toContain('/activate');
    expect(sent).not.toContain('invite-secret');
    expect(sent).not.toContain('jwt-secret');
    expect(sent).not.toContain('refresh-secret');
  });
});

describe('maskReplayAttribute', () => {
  it('masks attributes that can carry names or URLs', () => {
    for (const name of ['alt', 'title', 'aria-label', 'href', 'src', 'value'])
      expect(maskReplayAttribute(name, 'Jane Doe')).not.toContain('Jane');
  });

  it('keeps layout attributes so the replay still renders', () => {
    expect(maskReplayAttribute('class', 'flex gap-2')).toBe('flex gap-2');
    expect(maskReplayAttribute('style', 'width: 10px')).toBe('width: 10px');
  });
});
