import { describe, expect, it } from 'vitest';
import {
  checkHtmlFile,
  isValidSlug,
  MAX_PAGE_BYTES,
  suggestSlug,
} from './pageRules';

describe('suggestSlug', () => {
  it('lowercases and joins ASCII words with hyphens', () => {
    expect(suggestSlug('  Winter 2026: Lesson Guide!  ')).toBe(
      'winter-2026-lesson-guide',
    );
  });

  it('drops accents and non-ASCII characters', () => {
    expect(suggestSlug('Café Résumé')).toBe('cafe-resume');
    expect(suggestSlug('滑雪 Guide 指南')).toBe('guide');
  });

  it('returns an empty suggestion for Chinese-only titles', () => {
    expect(suggestSlug('滑雪课程指南')).toBe('');
  });

  it('caps the suggestion at 80 characters without a trailing hyphen', () => {
    const slug = suggestSlug(`${'a'.repeat(79)} bcd`);
    expect(slug).toBe('a'.repeat(79));
    expect(isValidSlug(slug)).toBe(true);
  });
});

describe('isValidSlug', () => {
  it.each(['a', 'guide', 'winter-2026', 'a1-b2-c3'])('accepts %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each([
    '',
    'Guide',
    '-guide',
    'guide-',
    'a--b',
    'a_b',
    'a b',
    'a'.repeat(81),
  ])('rejects %j', (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });
});

describe('checkHtmlFile', () => {
  it('accepts .html and .htm files up to 2 MiB', () => {
    expect(checkHtmlFile(new File(['<p>hi</p>'], 'a.html'))).toBeNull();
    expect(checkHtmlFile(new File(['<p>hi</p>'], 'A.HTM'))).toBeNull();
    expect(
      checkHtmlFile(new File([new Uint8Array(MAX_PAGE_BYTES)], 'max.html')),
    ).toBeNull();
  });

  it('rejects other extensions and oversize files', () => {
    expect(checkHtmlFile(new File(['x'], 'notes.txt'))).toBe('type');
    expect(
      checkHtmlFile(new File([new Uint8Array(MAX_PAGE_BYTES + 1)], 'big.html')),
    ).toBe('size');
  });
});
