import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  aliasBlocklistedScript,
  POSTHOG_PROXY_PATH,
  posthogUpstream,
} from './posthogProxy';

describe('posthogUpstream', () => {
  it('maps API calls to the PostHog ingestion host', () => {
    expect(
      posthogUpstream(new URL('https://portal.test/snr/flags/?v=2')),
    ).toEqual({ url: 'https://us.i.posthog.com/flags/?v=2', isAsset: false });
  });

  it('maps static files and remote config to the PostHog asset host', () => {
    expect(
      posthogUpstream(new URL('https://portal.test/snr/array/phc_x/config')),
    ).toEqual({
      url: 'https://us-assets.i.posthog.com/array/phc_x/config',
      isAsset: true,
    });
  });

  it('leaves app routes that only share the prefix alone', () => {
    expect(posthogUpstream(new URL('https://portal.test/snrx/e/'))).toBeNull();
    expect(posthogUpstream(new URL('https://portal.test/login'))).toBeNull();
  });
});

describe('wrangler.jsonc', () => {
  it('runs the Worker before static assets for the proxy path', () => {
    const source = readFileSync('wrangler.jsonc', 'utf8').replace(
      /^\s*\/\/.*$/gm,
      '',
    );
    const config = JSON.parse(source) as {
      main?: string;
      assets: { binding?: string; run_worker_first?: string[] };
    };

    expect(config.main).toBe('worker/src/index.ts');
    expect(config.assets.binding).toBe('ASSETS');
    expect(config.assets.run_worker_first).toContain(`${POSTHOG_PROXY_PATH}/*`);
  });
});

describe('ad-block-listed PostHog scripts', () => {
  it('loads the session recorder under a neutral name and restores it upstream', () => {
    const aliased = aliasBlocklistedScript(
      'https://portal.test/snr/static/1.438.12/posthog-recorder.js?v=1',
    );

    expect(aliased).not.toContain('posthog-recorder');
    expect(posthogUpstream(new URL(aliased))?.url).toBe(
      'https://us-assets.i.posthog.com/static/1.438.12/posthog-recorder.js?v=1',
    );
  });

  it('loads dead-click autocapture under a neutral name and restores it upstream', () => {
    const aliased = aliasBlocklistedScript(
      'https://portal.test/snr/static/dead-clicks-autocapture.js',
    );

    expect(aliased).not.toContain('dead-clicks-autocapture');
    expect(posthogUpstream(new URL(aliased))?.url).toBe(
      'https://us-assets.i.posthog.com/static/dead-clicks-autocapture.js',
    );
  });

  it('leaves other scripts untouched', () => {
    const surveys = 'https://portal.test/snr/static/1.438.12/surveys.js';
    const thirdParty = 'https://cdn.example.com/posthog-recorder.js';

    expect(aliasBlocklistedScript(surveys)).toBe(surveys);
    expect(aliasBlocklistedScript(thirdParty)).toBe(thirdParty);
  });
});
