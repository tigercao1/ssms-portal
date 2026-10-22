import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock('posthog-js', () => ({ default: posthog }));

async function loadAnalytics(posthogKey: string) {
  vi.resetModules();
  vi.doMock('./env', () => ({
    env: { posthogKey, posthogHost: 'https://ph.example.com' },
  }));
  return import('./analytics');
}

afterEach(() => {
  vi.clearAllMocks();
  vi.doUnmock('./env');
});

describe('analytics', () => {
  it('stays off and sends nothing without a key', async () => {
    const analytics = await loadAnalytics('');
    analytics.initAnalytics();
    analytics.identifyUser('user-1', 'instructor');
    analytics.track('profile_saved');
    analytics.resetUser();
    analytics.captureError(new Error('boom'));
    await Promise.resolve();

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.captureException).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });

  it('strips URL hashes and masks invite tokens when initialised', async () => {
    const analytics = await loadAnalytics('phc_test');
    analytics.initAnalytics();
    analytics.initAnalytics();

    await waitFor(() => expect(posthog.init).toHaveBeenCalledTimes(1));
    expect(posthog.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        api_host: 'https://ph.example.com',
        disable_capture_url_hashes: true,
        mask_personal_data_properties: true,
        custom_personal_data_properties: expect.arrayContaining(['t']),
        capture_exceptions: true,
        before_send: analytics.redactExceptionEvent,
        mask_all_text: true,
        mask_all_element_attributes: true,
        session_recording: expect.objectContaining({
          maskAllInputs: true,
          maskTextSelector: expect.stringContaining('[data-private]'),
          blockSelector: expect.stringContaining('canvas'),
          captureCanvas: { recordCanvas: false },
        }),
      }),
    );
  });

  it('forwards identity and events once initialised', async () => {
    const analytics = await loadAnalytics('phc_test');
    analytics.initAnalytics();
    analytics.identifyUser('user-1', 'admin');
    analytics.track('photo_uploaded', { slot: 'avatar' });
    analytics.resetUser();

    await waitFor(() => expect(posthog.reset).toHaveBeenCalledTimes(1));
    expect(posthog.identify).toHaveBeenCalledWith('user-1', { role: 'admin' });
    expect(posthog.capture).toHaveBeenCalledWith('photo_uploaded', {
      slot: 'avatar',
    });
  });

  it('reports caught errors and never throws when reporting fails', async () => {
    const analytics = await loadAnalytics('phc_test');
    analytics.initAnalytics();
    const error = new Error('boom');
    posthog.captureException.mockImplementationOnce(() => {
      throw new Error('posthog down');
    });

    expect(() => analytics.captureError(error)).not.toThrow();
    await waitFor(() =>
      expect(posthog.captureException).toHaveBeenCalledWith(error),
    );
    analytics.captureError(error);
    await waitFor(() =>
      expect(posthog.captureException).toHaveBeenCalledTimes(2),
    );
  });
});
