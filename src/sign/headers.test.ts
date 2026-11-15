import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headers = readFileSync('sign/public/_headers', 'utf8');

function cspSources(name: string) {
  const directive = new RegExp(`${name} ([^;\\n]+)`).exec(headers)?.[1] ?? '';
  return directive.trim().split(/\s+/);
}

describe('signing site headers', () => {
  it('lets only our own sites frame the signing form', () => {
    expect(cspSources('frame-ancestors')).toEqual([
      "'self'",
      'https://ssnow.club',
    ]);
  });

  it('lets the form reach only the signing API and the original PDF storage', () => {
    expect(cspSources('connect-src')).toEqual([
      "'self'",
      'https://sign-api.ssnow.club',
      'https://a4fbc4d3cf7b0d07dc0ccdd7db27eb6c.r2.cloudflarestorage.com',
    ]);
  });

  it('runs the PDF worker only from our own origin', () => {
    expect(cspSources('worker-src')).toEqual(["'self'"]);
    expect(cspSources('script-src')).toEqual(["'self'"]);
  });

  it('sends no referrer, so the prefill query never leaves the page', () => {
    expect(headers.match(/^\s*Referrer-Policy: .*$/gm)).toEqual([
      '  Referrer-Policy: no-referrer',
    ]);
    const head = /<head>\s*(<[^>]+>)/.exec(
      readFileSync('sign/index.html', 'utf8'),
    )?.[1];
    expect(head).toBe('<meta name="referrer" content="no-referrer" />');
  });

  it('keeps one valid Content-Security-Policy line', () => {
    const policies = headers.match(/^\s*Content-Security-Policy: (.*)$/gm);
    expect(policies).toHaveLength(1);
    const directives = policies![0]!
      .replace(/^\s*Content-Security-Policy: /, '')
      .split(';')
      .map((d) => d.trim().split(/\s+/)[0]);
    expect(new Set(directives).size).toBe(directives.length);
    expect(directives).toContain('default-src');
  });
});
