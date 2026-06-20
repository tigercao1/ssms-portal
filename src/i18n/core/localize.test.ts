import { describe, expect, it } from 'vitest';
import { localizeField } from './localize';

describe('localizeField', () => {
  it('returns _en for English locale', () => {
    expect(localizeField('Hello', '你好', 'en')).toBe('Hello');
  });
  it('returns _zh for zh-CN when present', () => {
    expect(localizeField('Hello', '你好', 'zh-CN')).toBe('你好');
  });
  it('falls back to _en when zh is empty/blank', () => {
    expect(localizeField('Hello', '', 'zh-CN')).toBe('Hello');
    expect(localizeField('Hello', '   ', 'zh-CN')).toBe('Hello');
    expect(localizeField('Hello', null, 'zh-CN')).toBe('Hello');
  });
  it('returns empty string when en is missing', () => {
    expect(localizeField(null, null, 'en')).toBe('');
  });
});
