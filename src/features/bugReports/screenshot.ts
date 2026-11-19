import { resizeImage } from '@/lib/resizeImage';
import type { ScreenshotContentType } from './types';

export const SCREENSHOT_TYPES: readonly ScreenshotContentType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];
export const SCREENSHOT_MAX_DIMENSION = 1600;
export const SCREENSHOT_MAX_BYTES = 3 * 1024 * 1024;

export type ScreenshotProblem =
  | 'screenshotType'
  | 'screenshotUnreadable'
  | 'screenshotTooLarge';

export class ScreenshotError extends Error {
  constructor(readonly problem: ScreenshotProblem) {
    super(problem);
    this.name = 'ScreenshotError';
  }
}

export function isScreenshotType(type: string): type is ScreenshotContentType {
  return (SCREENSHOT_TYPES as readonly string[]).includes(type);
}

export async function prepareScreenshot(file: Blob): Promise<Blob> {
  if (!isScreenshotType(file.type)) throw new ScreenshotError('screenshotType');
  const resized = await resizeImage(file, SCREENSHOT_MAX_DIMENSION).catch(
    () => {
      throw new ScreenshotError('screenshotUnreadable');
    },
  );
  if (resized.size > SCREENSHOT_MAX_BYTES)
    throw new ScreenshotError('screenshotTooLarge');
  return resized;
}
