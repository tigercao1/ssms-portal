import 'posthog-js/dist/exception-autocapture';
import posthog, { type CaptureResult } from 'posthog-js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  maskReplayAttribute,
  posthogConfig,
  PRIVATE_TEXT_SELECTOR,
  redactExceptionEvent,
  redactText,
  stripRequestUrl,
} from './analytics';

const events: CaptureResult[] = [];

beforeAll(() => {
  posthog.init('phc_test', {
    ...posthogConfig,
    api_host: 'http://posthog.invalid',
    disable_session_recording: true,
    advanced_disable_flags: true,
    before_send: [
      redactExceptionEvent,
      (event) => {
        if (event) events.push(event);
        return null;
      },
    ],
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

  it('redacts emails and activation tokens from reported and uncaught errors', async () => {
    expect(posthogConfig.before_send).toBe(redactExceptionEvent);
    const activation = 'https://portal.example.com/activate?t=invite-secret';
    const error = new Error(
      `Invite for alice@example.com failed: ${activation}`,
    );
    error.stack = [
      `Error: Invite for alice@example.com failed: ${activation}`,
      `    at activate (${activation}:10:5)`,
      '    at run (https://portal.example.com/assets/index-abc.js?v=1#access_token=jwt-secret:1:2)',
    ].join('\n');

    posthog.captureException(error);
    window.onerror?.(error.message, activation, 10, 5, error);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const exceptions = events.filter((e) => e.event === '$exception');
    expect(exceptions).toHaveLength(2);
    const sent = JSON.stringify(exceptions);
    expect(sent).not.toContain('alice@example.com');
    expect(sent).not.toContain('invite-secret');
    expect(sent).not.toContain('jwt-secret');
    for (const exception of exceptions) {
      const [first] = exception.properties.$exception_list;
      expect(first.type).toBe('Error');
      expect(first.value).toBe(
        'Invite for [email] failed: https://portal.example.com/activate',
      );
      expect(
        first.stacktrace.frames.map((f: { filename: string }) => f.filename),
      ).toEqual(
        expect.arrayContaining([
          'https://portal.example.com/activate',
          'https://portal.example.com/assets/index-abc.js',
        ]),
      );
    }
  });
});

describe('redactExceptionEvent', () => {
  function exceptionEvent(
    properties: CaptureResult['properties'],
  ): CaptureResult {
    return { uuid: 'event-1', event: '$exception', properties };
  }
  const JWT_TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

  it('redacts emails, JWTs and long secrets but keeps the rest of the message', () => {
    expect(
      redactText(
        `Invite for alice.b+1@example.co.uk failed with ${JWT_TOKEN} and key Zx9_kQ2mVb7LpR4sTn8wYc3HdJ6fGa1eUo5iKl0Nq`,
      ),
    ).toBe('Invite for [email] failed with [token] and key [token]');
    expect(
      redactText(
        'hash 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
      ),
    ).toBe('hash [token]');
    expect(
      redactText('Instructor 0b9c1c4e-1111-4222-8333-944455556666 not found'),
    ).toBe('Instructor 0b9c1c4e-1111-4222-8333-944455556666 not found');
  });

  it('strips query strings and hash fragments from URLs in messages', () => {
    expect(
      redactText(
        'Failed to load https://portal.example.com/activate?t=invite-secret',
      ),
    ).toBe('Failed to load https://portal.example.com/activate');
    expect(
      redactText(
        'No route matches URL "/reset-password?token_hash=reset-secret&type=recovery"',
      ),
    ).toBe('No route matches URL "/reset-password?token_hash=***&type=***"');
    expect(redactText('Callback /auth/callback?code=pkce-secret failed')).toBe(
      'Callback /auth/callback?code=*** failed',
    );
    expect(
      redactText(
        'Bad session in #access_token=jwt-secret&refresh_token=refresh-secret',
      ),
    ).toBe('Bad session in #access_token=***&refresh_token=***');
  });

  it('strips query strings and hashes from nested stack frames', () => {
    const event = exceptionEvent({
      $exception_level: 'error',
      $exception_source:
        'https://portal.example.com/auth/callback#access_token=jwt-secret',
      $exception_list: [
        {
          type: 'TypeError',
          value: 'Cannot read properties of undefined',
          mechanism: { type: 'generic', handled: true },
          stacktrace: {
            type: 'raw',
            frames: [
              {
                platform: 'web:javascript',
                filename: 'https://portal.example.com/activate?t=invite-secret',
                function: 'activate',
                lineno: 10,
                colno: 5,
                in_app: true,
              },
              {
                platform: 'web:javascript',
                filename:
                  'https://portal.example.com/assets/index-abc.js?v=1#frag',
                abs_path:
                  'https://portal.example.com/reset-password?token_hash=reset-secret',
                function: 'run',
                in_app: true,
              },
              {
                platform: 'web:javascript',
                filename: 'app:///index.js?code=pkce-secret',
                function: 'start',
                in_app: true,
              },
            ],
          },
        },
      ],
      $current_url: 'https://portal.example.com/activate?t=<masked>',
    });

    const redacted = redactExceptionEvent(event)!;

    expect(JSON.stringify(redacted)).not.toMatch(/secret|frag/);
    expect(redacted.properties.$exception_source).toBe(
      'https://portal.example.com/auth/callback',
    );
    const [exception] = redacted.properties.$exception_list;
    expect(exception.type).toBe('TypeError');
    expect(exception.value).toBe('Cannot read properties of undefined');
    expect(exception.stacktrace.frames).toEqual([
      expect.objectContaining({
        filename: 'https://portal.example.com/activate',
        function: 'activate',
        lineno: 10,
        colno: 5,
      }),
      expect.objectContaining({
        filename: 'https://portal.example.com/assets/index-abc.js',
        abs_path: 'https://portal.example.com/reset-password',
      }),
      expect.objectContaining({ filename: 'app:///index.js' }),
    ]);
    expect(redacted.properties.$exception_level).toBe('error');
    expect(redacted.properties.$current_url).toBe(
      'https://portal.example.com/activate?t=<masked>',
    );
  });

  it('passes other events through untouched', () => {
    const event: CaptureResult = {
      uuid: 'event-2',
      event: 'activation_failed',
      properties: { reason: 'alice@example.com' },
    };
    expect(redactExceptionEvent(event)).toBe(event);
  });

  it('drops an exception it cannot redact instead of sending it raw', () => {
    const exception = { type: 'Error' };
    Object.defineProperty(exception, 'value', {
      enumerable: true,
      get: () => {
        throw new Error('unreadable');
      },
    });
    expect(
      redactExceptionEvent(exceptionEvent({ $exception_list: [exception] })),
    ).toBeNull();
  });
});

describe('maskReplayAttribute', () => {
  function el(html: string, selector: string): Element {
    document.body.innerHTML = html;
    return document.querySelector(selector)!;
  }

  it('masks attributes that can carry names', () => {
    const button = el('<button title="Jane Doe">x</button>', 'button');
    for (const name of ['alt', 'title', 'aria-label', 'value'])
      expect(maskReplayAttribute(name, 'Jane Doe', button)).toBe('***');
  });

  it('keeps stylesheets so the replay renders with real styling', () => {
    const link = el('<link rel="stylesheet" href="/assets/index.css">', 'link');
    expect(maskReplayAttribute('rel', 'stylesheet', link)).toBe('stylesheet');
    expect(maskReplayAttribute('href', '/assets/index.css', link)).toBe(
      '/assets/index.css',
    );
    expect(maskReplayAttribute('_cssText', '.a{color:red}', link)).toBe(
      '.a{color:red}',
    );
  });

  it('keeps internal link paths with IDs replaced and masks external ones', () => {
    const a = el('<a href="#">x</a>', 'a');
    expect(
      maskReplayAttribute(
        'href',
        '/admin/instructors/0b9c1c4e-1111-4222-8333-944455556666?tab=docs',
        a,
      ),
    ).toBe('/admin/instructors/:id');
    expect(
      maskReplayAttribute('href', `${window.location.origin}/lessons?x=1`, a),
    ).toBe('/lessons');
    expect(maskReplayAttribute('href', 'mailto:jane@example.com', a)).toBe(
      '***',
    );
    expect(maskReplayAttribute('href', 'https://shop.example/jane', a)).toBe(
      '***',
    );
  });

  it('keeps layout attributes inside private containers', () => {
    const span = el(
      '<div data-private><span class="font-medium">Jane</span></div>',
      'span',
    );
    expect(maskReplayAttribute('class', 'font-medium', span)).toBe(
      'font-medium',
    );
    expect(maskReplayAttribute('href', '/profile', span)).toBe('***');
  });
});

describe('PRIVATE_TEXT_SELECTOR', () => {
  it('covers tagged containers, table bodies, values and dropdowns, not headings', () => {
    document.body.innerHTML = `
      <h1>Instructors</h1>
      <div data-private><span id="tagged">Jane</span></div>
      <table><thead><tr><th id="head">Name</th></tr></thead>
        <tbody><tr><td id="cell">Jane</td></tr></tbody></table>
      <table><tbody data-public><tr><td id="ref">Whistler</td></tr></tbody></table>
      <dl><dt id="term">Email</dt><dd id="value">jane@example.com</dd></dl>
      <select><option id="option">Jane</option></select>`;
    const masked = (id: string) =>
      document.getElementById(id)!.closest(PRIVATE_TEXT_SELECTOR) !== null;

    expect(masked('tagged')).toBe(true);
    expect(masked('cell')).toBe(true);
    expect(masked('value')).toBe(true);
    expect(masked('option')).toBe(true);
    expect(masked('head')).toBe(false);
    expect(masked('term')).toBe(false);
    expect(masked('ref')).toBe(false);
    expect(document.querySelector('h1')!.closest(PRIVATE_TEXT_SELECTOR)).toBe(
      null,
    );
  });
});

describe('URL paths in replays', () => {
  it('replaces path segments that could hold a name or email', () => {
    const a = document.createElement('a');
    expect(
      maskReplayAttribute('href', '/admin/instructors/jane@example.com', a),
    ).toBe('/admin/instructors/:id');
    expect(
      maskReplayAttribute('href', '/admin/instructors/Jane%20Doe', a),
    ).toBe('/admin/instructors/:id');
    expect(
      stripRequestUrl({
        name: 'https://api.example/admin/instructors/jane@example.com?q=1',
      }).name,
    ).toBe('https://api.example/admin/instructors/:id');
  });

  it('masks ids inside private containers', () => {
    document.body.innerHTML =
      '<ul data-private><li id="cal-jane@example.com">Jane</li></ul>';
    const li = document.querySelector('li')!;
    expect(maskReplayAttribute('id', li.id, li)).toBe('***');
  });

  it('keeps only layout links as-is', () => {
    document.body.innerHTML =
      '<link rel="alternate" href="https://x.example/jane@example.com">';
    const link = document.querySelector('link')!;
    expect(maskReplayAttribute('href', link.href, link)).toBe('***');
  });
});

describe('stripRequestUrl', () => {
  it('drops query strings so presigned signatures never reach the replay', () => {
    expect(
      stripRequestUrl({
        name: 'https://store.example/docs/0b9c1c4e-1111-4222-8333-944455556666.pdf?X-Amz-Signature=abc',
      }).name,
    ).toBe('https://store.example/docs/:id.pdf');
  });
});
