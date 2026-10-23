import 'posthog-js/dist/exception-autocapture';
import posthog, { type CaptureResult } from 'posthog-js';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import {
  maskReplayAttribute,
  maskUrlProperties,
  posthogConfig,
  PRIVATE_TEXT_SELECTOR,
  redactExceptionEvent,
  stripRequestUrl,
} from './analytics';

const events: CaptureResult[] = [];
const ORIGIN = window.location.origin;
const ROUND_ONE_MESSAGE =
  'Failed for alice@example.com token=SECRET_TOKEN password=PASSWORD_SECRET api_key=API_KEY_SECRET /activate?t=ACTIVATION_SECRET /auth/callback?code=CODE_SECRET #access_token=HASH_SECRET allletters ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOP numeric 123456 long Zx9_kQ2mVb7LpR4sTn8wYc3HdJ6fGa1eUo5iKl0Nq';
const ROUND_ONE_CAUSE =
  'Cause alice@example.com token=CAUSE_SECRET_TOKEN /update-password?token_hash=RESET_SECRET&code=CODE_SECRET #access_token=HASH_SECRET';
const ROUND_TWO_SUFFIX =
  ' {"access_token":["ARRAY_SECRET_ONE","ARRAY_SECRET_TWO"]} redirect=https%3A%2F%2Fportal.test%2Factivate%3Ft%3DENCODED_ACTIVATION email=alice%40example.com password=ab[BRACKET_SECRET]cd';
const LEAK_MESSAGES = [
  ROUND_ONE_MESSAGE,
  ROUND_ONE_CAUSE,
  ROUND_ONE_MESSAGE + ROUND_TWO_SUFFIX,
  ROUND_ONE_CAUSE + ROUND_TWO_SUFFIX,
  '{"access_token":["ARRAY_SECRET_ONE","ARRAY_SECRET_TWO"]}',
  'password=ab[BRACKET_SECRET]cd',
  'redirect=https%3A%2F%2Fportal.test%2Factivate%3Ft%3DENCODED_ACTIVATION',
  'email=alice%40example.com',
  'Failed for alice%2540example.com at %2Freset-password%3Ftoken_hash%3DPCT_SECRET',
  'Failed for alice\\u0040example.com with token\\u003dESCAPED_SECRET',
  'Failed for \uff41\uff4c\uff49\uff43\uff45\uff20example',
  'Failed with tok\u0435n SECRET in Cyrillic',
  'Failed with S\u200bECRET hidden by a zero width space',
  'Failed\nwith token SECRET on a new line',
  'Bearer SECRET_BEARER',
  'secret ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOP',
  `Failed ${'SECRET '.repeat(40)}`,
];
const LEAK_FRAMES = [
  `    at submit (${ORIGIN}/assets/index-abc123.js?v=VERSION_SECRET#access_token=HASH_SECRET:8:12)`,
  `    at activate (${ORIGIN}/activate?t=ACTIVATION_SECRET:20:2)`,
  '    at submit (http://127.0.0.1:8799/assets/index-abc123.js?v=VERSION_SECRET#access_token=HASH_SECRET:8:12)',
  '    at activate (http://127.0.0.1:8799/activate?t=ACTIVATION_SECRET:20:2)',
  '    at reset (app:///alice@example.com/index.js?token_hash=RESET_SECRET#access_token=HASH_SECRET:14:9)',
  '    at reset (https://portal.test/src/alice%40example.com/reset.js?token_hash=RESET_SECRET:14:9)',
  `    at load (${ORIGIN}/src/alice%40example.com/reset.js:3:1)`,
  `    at load (${ORIGIN}/assets/alice@example.com.js:3:1)`,
  `    at load (${ORIGIN}/assets/../reset-password?token_hash=RESET_SECRET:5:6)`,
  `    at Object.SECRET_FN (${ORIGIN}/node_modules/.vite/deps/chunk.js?v=SECRET_VERSION:1:2)`,
];
const SECRETS =
  /SECRET|ENCODED_ACTIVATION|alice|ABCDEFGHIJ|123456|Zx9_kQ2|\uff41\uff4c/;
type SentException = {
  type: string;
  value: string;
  mechanism?: { source?: string };
  stacktrace?: { frames: Record<string, unknown>[] };
};

function chainOf(messages: string[]): Error {
  const [message = '', ...causes] = messages;
  const error = new Error(
    message,
    causes.length ? { cause: chainOf(causes) } : undefined,
  );
  error.stack = [
    `Error: ${message}`,
    `    at reset (${ORIGIN}/update-password?token_hash=RESET_SECRET&code=CODE_SECRET#access_token=HASH_SECRET:14:9)`,
  ].join('\n');
  return error;
}

function sentExceptions(): CaptureResult[] {
  return events.filter((e) => e.event === '$exception');
}

function locationsOf(exception: CaptureResult): unknown[] {
  const list: SentException[] = exception.properties.$exception_list;
  return list
    .flatMap((entry) => entry.stacktrace?.frames ?? [])
    .flatMap((frame) => [frame.filename, frame.abs_path, frame.url])
    .filter((location) => location !== undefined);
}

beforeAll(() => {
  posthog.init('phc_test', {
    ...posthogConfig,
    api_host: 'http://posthog.invalid',
    disable_session_recording: true,
    advanced_disable_flags: true,
    error_tracking: { exceptionRateLimiterBucketSize: 100 },
    before_send: [
      maskUrlProperties,
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

  it('drops every recorded leak from reported, uncaught and rejected errors and their causes', async () => {
    expect(posthogConfig.before_send).toEqual([
      maskUrlProperties,
      redactExceptionEvent,
    ]);
    const error = chainOf(LEAK_MESSAGES);
    error.stack = [`Error: ${error.message}`, ...LEAK_FRAMES].join('\n');

    posthog.captureException(error);
    window.onerror?.(
      error.message,
      `${ORIGIN}/activate?t=ONERROR_SECRET`,
      20,
      2,
      error,
    );
    window.dispatchEvent(
      new CustomEvent('unhandledrejection', { detail: { reason: error } }),
    );
    const properties = posthog.exceptions?.buildProperties(error, {
      handled: true,
    });
    const [frame] = properties?.$exception_list[0]?.stacktrace?.frames ?? [];
    Object.assign(frame ?? {}, {
      filename:
        'https://portal.test/src/alice%40example.com/reset.js?token_hash=RESET_SECRET',
      abs_path: `${ORIGIN}/reset-password?token_hash=RESET_SECRET#access_token=HASH_SECRET`,
      url: `${ORIGIN}/auth/callback?code=CODE_SECRET`,
      context_line: 'const token = "CONTEXT_SECRET";',
      vars: { email: 'alice@example.com' },
      module: 'alice@example.com',
    });
    posthog.captureException(error, {
      ...properties,
      $exception_source: `${ORIGIN}/activate?t=ACTIVATION_SECRET#access_token=HASH_SECRET`,
      $exception_message: error.message,
      $exception_type: 'alice@example.com',
      $exception_steps: [
        { $message: 'Signed in as alice@example.com', otp: 'OTP_SECRET' },
      ],
      $exception_fingerprint: 'alice@example.com',
      $exception_personURL: `${ORIGIN}/person/alice@example.com`,
      $exception_types: ['SECRET_TYPE'],
      $exception_values: [error.message],
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const exceptions = sentExceptions();
    expect(exceptions).toHaveLength(4);
    expect(JSON.stringify(exceptions)).not.toMatch(SECRETS);
    for (const exception of exceptions) {
      expect(
        Object.keys(exception.properties)
          .filter((key) => key.startsWith('$exception'))
          .sort(),
      ).toEqual(['$exception_level', '$exception_list']);
      const list: SentException[] = exception.properties.$exception_list;
      const [root, ...causes] = list;
      expect(list.map((entry) => entry.value)).toEqual(
        LEAK_MESSAGES.map(() => '[redacted]'),
      );
      expect(causes.map((cause) => cause.mechanism?.source)).toEqual(
        causes.map(() => 'cause'),
      );
      expect(root?.stacktrace?.frames).toEqual(
        expect.arrayContaining([
          {
            platform: 'web:javascript',
            function: 'submit',
            filename: `${ORIGIN}/assets/index-abc123.js`,
            in_app: true,
            lineno: 8,
            colno: 12,
          },
          {
            platform: 'web:javascript',
            function: 'activate',
            in_app: true,
            lineno: 20,
            colno: 2,
          },
        ]),
      );
      expect(
        locationsOf(exception).every((location) =>
          [
            `${ORIGIN}/assets/index-abc123.js`,
            `${ORIGIN}/node_modules/.vite/deps/chunk.js`,
          ].includes(String(location)),
        ),
      ).toBe(true);
    }
  });

  it('drops the text of non-Error, array, object and oversized throwables', async () => {
    const huge = new Error(`Failed ${'SECRET '.repeat(200_000)}`);
    huge.stack = [
      `Error: ${huge.message}`,
      ...Array.from(
        { length: 5_000 },
        (_, i) =>
          `    at Object.SECRET_${i} (${ORIGIN}/activate?t=SECRET_${i}:${i + 1}:1)`,
      ),
    ].join('\n');
    posthog.captureException('token=STRING_SECRET for alice@example.com');
    posthog.captureException({
      token: 'OBJECT_SECRET',
      message: 'Failed for alice@example.com',
    });
    posthog.captureException(
      Object.assign(new Error(), {
        message: ['ARRAY_SECRET_ONE', 'ARRAY_SECRET_TWO'],
      }),
    );
    posthog.captureException(
      Object.assign(new Error(), {
        message: { error: { message: 'NESTED_SECRET for alice@example.com' } },
      }),
    );
    posthog.captureException(huge);
    window.onerror?.(
      'Uncaught Error: token=ONERROR_SECRET',
      `${ORIGIN}/activate?t=ONERROR_SECRET`,
      3,
      4,
    );
    for (const reason of [
      'token=REJECTION_SECRET',
      { token: 'OBJECT_SECRET' },
      ['ARRAY_SECRET_ONE', 'ARRAY_SECRET_TWO'],
    ])
      window.dispatchEvent(
        new CustomEvent('unhandledrejection', { detail: { reason } }),
      );
    await new Promise((resolve) => setTimeout(resolve, 50));

    const exceptions = sentExceptions();
    expect(exceptions).toHaveLength(9);
    expect(JSON.stringify(exceptions)).not.toMatch(SECRETS);
    expect(JSON.stringify(exceptions).length).toBeLessThan(50_000);
    for (const exception of exceptions) {
      const list: SentException[] = exception.properties.$exception_list;
      expect(list.map((entry) => entry.value)).toEqual(
        list.map(() => '[redacted]'),
      );
      expect(locationsOf(exception)).toEqual([]);
    }
  });

  it('keeps the type, message, function, line and column of a NotFoundError from a bundle frame', async () => {
    const stack = [
      'insertBefore@[native code]',
      `commitPlacement@${ORIGIN}/assets/index-abc123.js?v=1#hash:8:12`,
    ].join('\n');
    const domException = new DOMException(
      'The object can not be found here.',
      'NotFoundError',
    );
    Object.defineProperty(domException, 'stack', { value: stack });
    const namedError = Object.assign(
      new Error('The object can not be found here.'),
      { name: 'NotFoundError', stack },
    );

    posthog.captureException(domException);
    window.onerror?.('', `${ORIGIN}/assets/index-abc123.js`, 8, 12, namedError);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const exceptions = sentExceptions();
    expect(exceptions).toHaveLength(2);
    const frames = [
      {
        platform: 'web:javascript',
        function: 'commitPlacement',
        filename: `${ORIGIN}/assets/index-abc123.js`,
        in_app: true,
        lineno: 8,
        colno: 12,
      },
      { platform: 'web:javascript', function: 'insertBefore', in_app: true },
    ];
    expect(exceptions.map((e) => e.properties.$exception_list)).toEqual([
      [
        {
          type: 'DOMException',
          value: 'NotFoundError: The object can not be found here.',
          mechanism: {
            type: 'generic',
            handled: true,
            synthetic: false,
            exception_id: 0,
          },
          stacktrace: { type: 'raw', frames },
        },
      ],
      [
        {
          type: 'NotFoundError',
          value: 'The object can not be found here.',
          mechanism: {
            type: 'generic',
            handled: false,
            synthetic: false,
            exception_id: 0,
          },
          stacktrace: { type: 'raw', frames },
        },
      ],
    ]);
  });

  it('redacts a message behind an error name that is not the standard name of the error', async () => {
    const value = 'AbCdEfGhIjKlMnOpQrStUvWxYzError: Request failed';
    for (const name of ['Error', 'AbCdEfGhIjKlMnOpQrStUvWxYzError']) {
      const error = Object.assign(new Error(value), {
        name,
        stack: `${name}: ${value}\n    at submit (${ORIGIN}/assets/index-abc123.js:8:12)`,
      });
      posthog.captureException(error);
      window.onerror?.(value, `${ORIGIN}/assets/index-abc123.js`, 8, 12, error);
      window.dispatchEvent(
        new CustomEvent('unhandledrejection', { detail: { reason: error } }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    const lists: SentException[][] = sentExceptions().map(
      (e) => e.properties.$exception_list,
    );
    expect(lists).toHaveLength(6);
    for (const [entry] of lists) expect(entry?.value).toBe('[redacted]');
  });
});

describe('URL properties after a same-origin navigation with the real SDK', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'referrer');
    window.history.pushState({}, '', '/');
  });

  it.each([
    [`${ORIGIN}/activate?t=SECRET_ACTIVATION`, `${ORIGIN}/activate?t=<masked>`],
    [
      `${ORIGIN}/reset?token_hash=SECRET_RESET&type=recovery&code=SECRET_CODE`,
      `${ORIGIN}/reset?token_hash=<masked>&type=recovery&code=<masked>`,
    ],
  ])(
    'masks the tokens of %s in every event and person property',
    async (from, masked) => {
      posthog.reset();
      Object.defineProperty(document, 'referrer', {
        configurable: true,
        value: from,
      });
      window.history.pushState({}, '', '/login?lang=en');
      posthog.identify('user-1');
      posthog.capture('$pageview');
      posthog.capture('activation_completed');
      posthog.captureException(new Error('Request failed'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.map((e) => e.event)).toEqual(
        expect.arrayContaining([
          '$identify',
          '$pageview',
          'activation_completed',
          '$exception',
        ]),
      );
      expect(JSON.stringify(events)).not.toContain('SECRET');
      for (const event of events)
        expect(event.properties).toMatchObject({
          $current_url: `${ORIGIN}/login?lang=en`,
          $referrer: masked,
          $session_entry_referrer: masked,
          $session_entry_url: `${ORIGIN}/login?lang=en`,
        });
      expect(
        events.find((e) => e.event === '$identify')?.$set_once,
      ).toMatchObject({
        $initial_referrer: masked,
        $initial_current_url: `${ORIGIN}/login?lang=en`,
        $referrer: masked,
        $current_url: `${ORIGIN}/login?lang=en`,
      });
    },
  );
});

describe('redactExceptionEvent', () => {
  function exceptionEvent(
    properties: CaptureResult['properties'],
  ): CaptureResult {
    return { uuid: 'event-1', event: '$exception', properties };
  }
  function firstException(properties: CaptureResult['properties']) {
    return redactExceptionEvent(exceptionEvent(properties))?.properties
      .$exception_list[0];
  }
  function frameOf(frame: Record<string, unknown>) {
    return firstException({
      $exception_list: [{ stacktrace: { type: 'raw', frames: [frame] } }],
    }).stacktrace.frames[0];
  }

  it('rebuilds the event from allowlisted exception fields only', () => {
    const event = exceptionEvent({
      $current_url: `${ORIGIN}/activate?t=<masked>`,
      $pathname: '/activate',
      $release_id: 'release-1',
      $exception_level: 'error',
      $exception_capture_enabled_server_side: true,
      $exception_source: 'mcp.tool_call',
      $exception_message: 'Failed for alice@example.com',
      $exception_type: 'TypeError',
      $exception_types: ['TypeError'],
      $exception_values: ['Failed for alice@example.com'],
      $exception_steps: [{ $message: 'Signed in', otp: 987654 }],
      $exception_personURL: `${ORIGIN}/person/alice`,
      $exception_fingerprint: 'alice',
      $exception_list: [
        {
          type: 'TypeError',
          value: 'Failed to fetch',
          module: 'alice',
          thread_id: 1,
          mechanism: {
            type: 'generic',
            handled: false,
            synthetic: false,
            exception_id: 0,
            data: { email: 'alice@example.com' },
          },
          stacktrace: {
            type: 'raw',
            frames: [
              {
                platform: 'web:javascript',
                filename: `${ORIGIN}/assets/index-abc.js?v=1#frag`,
                abs_path: `${ORIGIN}/assets/index-abc.js`,
                function: 'run',
                module: 'alice',
                lineno: 1,
                colno: 2,
                in_app: true,
                chunk_id: 'alice',
                context_line: 'alice',
                pre_context: ['alice'],
                post_context: ['alice'],
                vars: { email: 'alice' },
                instruction_addr: 'alice',
                addr_mode: 'alice',
              },
            ],
          },
        },
        {
          type: 'Error',
          value: 'Cause for alice@example.com',
          mechanism: {
            type: 'chained',
            source: 'cause',
            synthetic: false,
            exception_id: 1,
            parent_id: 0,
          },
        },
      ],
    });

    const redacted = redactExceptionEvent(event);

    expect(JSON.stringify(redacted)).not.toMatch(/alice|frag/);
    expect(redacted).toEqual({
      uuid: 'event-1',
      event: '$exception',
      properties: {
        $current_url: `${ORIGIN}/activate?t=<masked>`,
        $pathname: '/activate',
        $release_id: 'release-1',
        $exception_level: 'error',
        $exception_capture_enabled_server_side: true,
        $exception_list: [
          {
            type: 'TypeError',
            value: 'Failed to fetch',
            mechanism: {
              type: 'generic',
              handled: false,
              synthetic: false,
              exception_id: 0,
            },
            stacktrace: {
              type: 'raw',
              frames: [
                {
                  platform: 'web:javascript',
                  filename: `${ORIGIN}/assets/index-abc.js`,
                  abs_path: `${ORIGIN}/assets/index-abc.js`,
                  function: 'run',
                  lineno: 1,
                  colno: 2,
                  in_app: true,
                },
              ],
            },
          },
          {
            type: 'Error',
            value: '[redacted]',
            mechanism: {
              type: 'chained',
              source: 'cause',
              synthetic: false,
              exception_id: 1,
              parent_id: 0,
            },
          },
        ],
      },
    });
  });

  it('keeps only short plain-word messages', () => {
    const kept = [
      'The object can not be found here.',
      'Failed to fetch',
      'Load failed',
      "Cannot read properties of undefined (reading 'map')",
      'Something went wrong!',
      '',
    ];
    for (const value of kept)
      expect(firstException({ $exception_list: [{ value }] }).value).toBe(
        value,
      );
    const redacted: unknown[] = [
      ...LEAK_MESSAGES,
      'Invite for alice failed with code 4',
      'User alice_smith not found',
      'Failed for alice@example.com',
      'Expected one of: a, b',
      'Failed (see /activate)',
      'Retry in a moment & try again',
      'Fehler für Benutzer',
      'Failed\twith a tab',
      `Failed ${'a'.repeat(25)}`,
      `Failed ${'word '.repeat(40)}`,
      'NotFoundError: The object can not be found here.',
      'Uncaught NotFoundError: The object can not be found here.',
      'alice: The object can not be found here.',
      `${'A'.repeat(60)}Error: The object can not be found here.`,
      undefined,
      null,
      42,
      ['Failed to fetch'],
      { message: 'Failed to fetch' },
    ];
    for (const value of redacted)
      expect(firstException({ $exception_list: [{ value }] }).value).toBe(
        '[redacted]',
      );
  });

  it('keeps an error name prefix only when it is the standard name of the error', () => {
    const kept: [string, string][] = [
      ['DOMException', 'NotFoundError: The object can not be found here.'],
      ['NotFoundError', 'NotFoundError: The object can not be found here.'],
      ['TypeError', 'TypeError: Failed to fetch'],
      ['Error', 'Error: Something went wrong!'],
      ['ChunkLoadError', 'ChunkLoadError: Loading chunk failed.'],
    ];
    for (const [type, value] of kept)
      expect(firstException({ $exception_list: [{ type, value }] }).value).toBe(
        value,
      );
    const redacted: [string, string][] = [
      ['Error', 'NotFoundError: The object can not be found here.'],
      ['TypeError', 'RangeError: Failed to fetch'],
      ['Error', 'AbCdEfGhIjKlMnOpQrStUvWxYzError: Request failed'],
      [
        'AbCdEfGhIjKlMnOpQrStUvWxYzError',
        'AbCdEfGhIjKlMnOpQrStUvWxYzError: Request failed',
      ],
      ['DOMException', 'AbCdEfGhIjKlMnOpQrStUvWxYzError: Request failed'],
      ['DOMException', 'DOMException: Request failed'],
      ['ValidationError', 'ValidationError: Request failed'],
      ['TypeError', 'TypeError: TypeError: Failed to fetch'],
    ];
    for (const [type, value] of redacted)
      expect(firstException({ $exception_list: [{ type, value }] }).value).toBe(
        '[redacted]',
      );
  });

  it('keeps type and function names only when they are identifiers', () => {
    for (const name of ['TypeError', 'NotFoundError', 'submit', 'a', 'x_1'])
      expect([
        firstException({ $exception_list: [{ type: name }] }).type,
        frameOf({ function: name }).function,
      ]).toEqual([name, name]);
    for (const name of [
      'alice@example.com',
      'Object.submit',
      'token=SECRET',
      '?',
      '<anonymous>',
      '1Error',
      '',
      'A'.repeat(65),
      'Errör',
      42,
      undefined,
    ]) {
      expect(firstException({ $exception_list: [{ type: name }] }).type).toBe(
        'Error',
      );
      expect(frameOf({ function: name })).toEqual({});
    }
  });

  it('keeps frame locations only for bundle files on the portal origin', () => {
    const kept: [string, string][] = [
      [`${ORIGIN}/assets/index-abc123.js`, `${ORIGIN}/assets/index-abc123.js`],
      [
        `${ORIGIN}/assets/index-abc123.js?t=SECRET#access_token=SECRET`,
        `${ORIGIN}/assets/index-abc123.js`,
      ],
      ['/src/lib/analytics.ts?t=1', `${ORIGIN}/src/lib/analytics.ts`],
      [
        `${ORIGIN}/node_modules/.vite/deps/react-dom_client.js?v=abc`,
        `${ORIGIN}/node_modules/.vite/deps/react-dom_client.js`,
      ],
      [`${ORIGIN}/pdfjs/wasm/openjpeg.js`, `${ORIGIN}/pdfjs/wasm/openjpeg.js`],
    ];
    for (const [location, expected] of kept)
      expect(frameOf({ filename: location, abs_path: location })).toEqual({
        filename: expected,
        abs_path: expected,
      });
    for (const location of [
      `${ORIGIN}/activate?t=SECRET`,
      `${ORIGIN}/reset-password`,
      `${ORIGIN}/assets/../activate`,
      `${ORIGIN}/assets/alice@example.com.js`,
      `${ORIGIN}/src/alice%40example.com/reset.js`,
      `${ORIGIN}/assets/café.js`,
      `${ORIGIN}/assets/a b.js`,
      'https://portal.test/assets/index-abc123.js',
      'http://127.0.0.1:8799/assets/index-abc123.js',
      '//evil.example/assets/index.js',
      'app:///assets/index-abc.js',
      'blob:http://localhost:3000/assets/index.js',
      'file:///Users/alice/assets/index.js',
      '[native code]',
      '<anonymous>',
      'http://[',
      42,
    ])
      expect(frameOf({ filename: location, abs_path: location })).toEqual({});
  });

  it('passes other events through untouched', () => {
    const event: CaptureResult = {
      uuid: 'event-2',
      event: 'activation_failed',
      properties: { reason: 'alice@example.com' },
    };
    expect(redactExceptionEvent(event)).toBe(event);
  });

  it('drops an exception it cannot read instead of sending it raw', () => {
    const exception = { type: 'Error' };
    Object.defineProperty(exception, 'value', {
      enumerable: true,
      get: () => {
        throw new Error('unreadable');
      },
    });
    for (const $exception_list of [
      [exception],
      undefined,
      'Failed for alice@example.com',
      { type: 'Error' },
      ['Failed for alice@example.com'],
      [null],
    ])
      expect(
        redactExceptionEvent(exceptionEvent({ $exception_list })),
      ).toBeNull();
  });

  it('reads only allowlisted fields of cyclic and very large input', () => {
    const cyclic: Record<string, unknown> = { type: 'Error' };
    cyclic.self = cyclic;
    cyclic.mechanism = cyclic;
    expect(firstException({ $exception_list: [cyclic] })).toEqual({
      type: 'Error',
      value: '[redacted]',
      mechanism: { type: 'Error' },
    });

    const frames = Array.from({ length: 100_000 }, (_, i) => ({
      platform: 'web:javascript',
      function: `fn${i}`,
      filename: `${ORIGIN}/activate?t=SECRET_${i}`,
      lineno: i,
      context_line: 'SECRET '.repeat(100),
    }));
    const exception = firstException({
      $exception_list: [
        {
          type: 'Error',
          value: 'SECRET '.repeat(1_000_000),
          stacktrace: { frames },
        },
      ],
    });
    expect(exception.value).toBe('[redacted]');
    expect(exception.stacktrace.frames).toHaveLength(100_000);
    expect(JSON.stringify(exception)).not.toContain('SECRET');
  });
});

describe('referrer policy', () => {
  it('tells the browser never to send a page URL as the referrer, before any request', () => {
    const page = new DOMParser().parseFromString(indexHtml, 'text/html');
    expect(
      [...page.querySelectorAll('meta[name="referrer"]')].map((meta) =>
        meta.getAttribute('content'),
      ),
    ).toEqual(['no-referrer']);
    expect(
      page
        .querySelector('meta[name="referrer"], link, script')
        ?.getAttribute('name'),
    ).toBe('referrer');
  });
});

describe('maskUrlProperties', () => {
  const RESET_URL = `${ORIGIN}/reset?token_hash=SECRET&type=recovery&code=SECRET`;
  const MASKED_RESET_URL = `${ORIGIN}/reset?token_hash=<masked>&type=recovery&code=<masked>`;
  const URL_KEYS = [
    '$current_url',
    '$referrer',
    '$session_entry_url',
    '$session_entry_referrer',
    '$initial_current_url',
    '$initial_referrer',
  ];
  const withUrl = (url: string) =>
    Object.fromEntries(URL_KEYS.map((key) => [key, url]));

  it('masks token parameters in every URL property, including person properties', () => {
    const event: CaptureResult = {
      uuid: 'event-3',
      event: 'activation_completed',
      properties: {
        ...withUrl(RESET_URL),
        $pathname: '/reset',
        $referring_domain: 'portal.test',
        note: 'see ?t=KEPT',
        $set_once: withUrl(RESET_URL),
      },
      $set: withUrl(RESET_URL),
      $set_once: withUrl(RESET_URL),
    };

    expect(maskUrlProperties(event)).toEqual({
      uuid: 'event-3',
      event: 'activation_completed',
      properties: {
        ...withUrl(MASKED_RESET_URL),
        $pathname: '/reset',
        $referring_domain: 'portal.test',
        note: 'see ?t=KEPT',
        $set_once: withUrl(MASKED_RESET_URL),
      },
      $set: withUrl(MASKED_RESET_URL),
      $set_once: withUrl(MASKED_RESET_URL),
    });
  });

  it('masks each token parameter wherever it sits in the URL', () => {
    const cases: [string, string][] = [
      [`${ORIGIN}/activate?t=SECRET`, `${ORIGIN}/activate?t=<masked>`],
      [
        `${ORIGIN}/activate?source=email&t=SECRET&lang=en`,
        `${ORIGIN}/activate?source=email&t=<masked>&lang=en`,
      ],
      [
        `${ORIGIN}/login?at=1&tt=2&token=SECRET`,
        `${ORIGIN}/login?at=1&tt=2&token=<masked>`,
      ],
      [`${ORIGIN}/a?x=1?code=SECRET`, `${ORIGIN}/a?x=1?code=<masked>`],
      [`${ORIGIN}/a?x=1#code=SECRET`, `${ORIGIN}/a?x=1#code=<masked>`],
      [`${ORIGIN}/a?t=`, `${ORIGIN}/a?t=<masked>`],
    ];
    for (const [$referrer, expected] of cases)
      expect(
        maskUrlProperties({
          uuid: 'e',
          event: '$pageview',
          properties: { $referrer },
        }).properties.$referrer,
      ).toBe(expected);
  });

  it('returns the event untouched when no URL property carries a token', () => {
    const event: CaptureResult = {
      uuid: 'event-4',
      event: '$pageview',
      properties: {
        $current_url: `${ORIGIN}/activate?t=<masked>`,
        $referrer: '$direct',
        $session_entry_referrer: `${ORIGIN}/login?tab=profile`,
        token: 'phc_test',
        $set_once: { $initial_referrer: 'https://mail.example/inbox' },
      },
      $set_once: { $initial_current_url: `${ORIGIN}/activate?t=<masked>` },
    };
    expect(maskUrlProperties(event)).toBe(event);
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
