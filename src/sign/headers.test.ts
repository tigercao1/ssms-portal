import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function cspSources(name: string) {
  const headers = readFileSync('sign/public/_headers', 'utf8');
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
});
