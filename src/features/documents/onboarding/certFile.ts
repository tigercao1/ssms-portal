import { resizeImage } from '@/lib/resizeImage';
import { todayIso, type CertContentType } from '../api';

export const MAX_CERT_BYTES = 10 * 1024 * 1024;

export const CERT_CONTENT_TYPES: readonly CertContentType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export type CertFileError = 'fileRequired' | 'fileType' | 'fileTooLarge';

export function isCertContentType(type: string): type is CertContentType {
  return (CERT_CONTENT_TYPES as readonly string[]).includes(type);
}

export function validateCertFile(
  file: Blob | null | undefined,
): CertFileError | null {
  if (!file) return 'fileRequired';
  if (!isCertContentType(file.type)) return 'fileType';
  if (file.size > MAX_CERT_BYTES) return 'fileTooLarge';
  return null;
}

/** A `YYYY-MM-DD` date that is today or later in UTC, the date the API checks against. */
export function isValidUntilAcceptable(
  value: string,
  today: string = todayIso(),
): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= today;
}

/** Images are downscaled with the shared resize helper when that makes them smaller; PDFs go as-is. */
export async function prepareCertFile(file: File): Promise<Blob> {
  const typeError = validateCertFile(file);
  if (typeError === 'fileType' || typeError === 'fileRequired')
    throw new Error(typeError);
  if (file.type === 'application/pdf') {
    if (file.size > MAX_CERT_BYTES) throw new Error('fileTooLarge');
    return file;
  }
  const resized = await resizeImage(file).catch(() => null);
  const chosen = resized && resized.size < file.size ? resized : file;
  if (chosen.size > MAX_CERT_BYTES) throw new Error('fileTooLarge');
  return chosen;
}
