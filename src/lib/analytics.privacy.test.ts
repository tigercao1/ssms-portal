import posthog, { type CaptureResult } from 'posthog-js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  maskReplayAttribute,
  posthogConfig,
  PRIVATE_TEXT_SELECTOR,
  stripRequestUrl,
} from './analytics';

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
