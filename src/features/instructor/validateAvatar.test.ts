import { describe, expect, it } from 'vitest';
import { validateAvatar } from './api';

function file(type: string, size: number): File {
  const f = new File(['x'], 'a', { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateAvatar (W2.3)', () => {
  it('accepts jpeg/png/webp under 5 MB', () => {
    expect(validateAvatar(file('image/jpeg', 1000))).toBeNull();
    expect(validateAvatar(file('image/png', 1000))).toBeNull();
    expect(validateAvatar(file('image/webp', 1000))).toBeNull();
  });
  it('rejects a disallowed mime', () => {
    expect(validateAvatar(file('image/gif', 1000))).toMatch(/JPEG/);
  });
  it('rejects files over 5 MB', () => {
    expect(validateAvatar(file('image/png', 6 * 1024 * 1024))).toMatch(/5 MB/);
  });
});
