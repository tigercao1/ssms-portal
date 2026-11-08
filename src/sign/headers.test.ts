import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function frameAncestors() {
  const headers = readFileSync('sign/public/_headers', 'utf8');
  const directive = /frame-ancestors ([^;\n]+)/.exec(headers)?.[1] ?? '';
  return directive.trim().split(/\s+/);
}

describe('signing site headers', () => {
  it('lets only our own sites frame the signing form', () => {
    expect(frameAncestors()).toEqual(["'self'", 'https://ssnow.club']);
  });
});
