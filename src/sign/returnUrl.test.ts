import { describe, expect, it } from 'vitest';
import { allowedReturnUrl } from './returnUrl';

describe('return URL allowlist', () => {
  it.each([
    'https://ssnow.club/pages/waiver',
    'https://ssnow.club/en/pages/waiver?x=1#top',
    'https://www.ssnow.club/products/lesson',
  ])('allows %s', (url) => {
    expect(allowedReturnUrl(url)).toBe(new URL(url).href);
  });

  it.each([
    null,
    '',
    '/pages/waiver',
    'http://ssnow.club/pages/waiver',
    'https://evil.com/?https://ssnow.club',
    'https://ssnow.club.evil.com/',
    'https://evilssnow.club/',
    'https://user@ssnow.club/',
    'https://ssnow.club:8443/',
    'javascript:alert(1)//ssnow.club',
    'not a url',
  ])('refuses %s', (url) => {
    expect(allowedReturnUrl(url)).toBeNull();
  });
});
