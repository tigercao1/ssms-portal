import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_CERT_BYTES,
  isValidUntilAcceptable,
  prepareCertFile,
  validateCertFile,
} from './certFile';
import { mockImagePipeline, sizedFile } from '@/test/imageMocks';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('certFile', () => {
  it('validates presence, type and size', () => {
    expect(validateCertFile(null)).toBe('fileRequired');
    expect(validateCertFile(sizedFile('a.gif', 'image/gif', 10))).toBe('fileType');
    expect(validateCertFile(sizedFile('a.pdf', 'application/pdf', MAX_CERT_BYTES + 1))).toBe('fileTooLarge');
    expect(validateCertFile(sizedFile('a.pdf', 'application/pdf', 1000))).toBeNull();
  });

  it('accepts valid-until dates from today on', () => {
    expect(isValidUntilAcceptable('2026-10-12', '2026-10-12')).toBe(true);
    expect(isValidUntilAcceptable('2027-06-30', '2026-10-12')).toBe(true);
    expect(isValidUntilAcceptable('2026-10-11', '2026-10-12')).toBe(false);
    expect(isValidUntilAcceptable('', '2026-10-12')).toBe(false);
    expect(isValidUntilAcceptable('12/10/2026', '2026-10-12')).toBe(false);
  });

  it('passes PDFs through untouched', async () => {
    const pdf = sizedFile('c.pdf', 'application/pdf', 2000);
    await expect(prepareCertFile(pdf)).resolves.toBe(pdf);
    await expect(
      prepareCertFile(sizedFile('c.pdf', 'application/pdf', MAX_CERT_BYTES + 1)),
    ).rejects.toThrow('fileTooLarge');
  });

  it('resizes large photos with the shared helper', async () => {
    mockImagePipeline({ width: 4000, height: 3000, outputBytes: 900_000 });
    const out = await prepareCertFile(sizedFile('c.jpg', 'image/jpeg', 12 * 1024 * 1024));
    expect(out.size).toBe(900_000);
    expect(out.type).toBe('image/jpeg');
  });

  it('keeps the original photo when resizing does not help', async () => {
    mockImagePipeline({ width: 100, height: 100, outputBytes: 5000, decodeFails: true });
    const png = sizedFile('c.png', 'image/png', 3000);
    await expect(prepareCertFile(png)).resolves.toBe(png);
    await expect(prepareCertFile(sizedFile('c.gif', 'image/gif', 1))).rejects.toThrow('fileType');
  });
});
