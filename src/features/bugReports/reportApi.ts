import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { Messages } from '@/i18n/core/types';
import { putToPresignedUrl } from '@/features/documents/api';
import { isScreenshotType } from './screenshot';
import type {
  BugReportBody,
  CreatedBugReport,
  ScreenshotUploadUrl,
  ScreenshotUploadUrlBody,
} from './types';

export class ScreenshotUploadError extends Error {
  constructor() {
    super('Screenshot upload failed');
    this.name = 'ScreenshotUploadError';
  }
}

export interface BugReportSubmission {
  report: Omit<BugReportBody, 'screenshotKey'>;
  screenshot: Blob | null;
}

async function uploadScreenshot(screenshot: Blob): Promise<string> {
  if (!isScreenshotType(screenshot.type)) throw new ScreenshotUploadError();
  const body: ScreenshotUploadUrlBody = {
    contentType: screenshot.type,
    contentLength: screenshot.size,
  };
  try {
    const { uploadUrl, key } = await api<ScreenshotUploadUrl>(
      '/me/bug-reports/screenshot-url',
      { method: 'POST', body },
    );
    await putToPresignedUrl(uploadUrl, screenshot, body.contentType);
    return key;
  } catch {
    throw new ScreenshotUploadError();
  }
}

export async function submitBugReport({
  report,
  screenshot,
}: BugReportSubmission): Promise<CreatedBugReport> {
  const screenshotKey = screenshot
    ? await uploadScreenshot(screenshot)
    : undefined;
  const body: BugReportBody = screenshotKey
    ? { ...report, screenshotKey }
    : report;
  return api<CreatedBugReport>('/me/bug-reports', { method: 'POST', body });
}

export function useSubmitBugReport() {
  return useMutation({ gcTime: 0, mutationFn: submitBugReport });
}

export function submitErrorText(error: unknown, t: Messages): string {
  const s = t.bugReport;
  if (error instanceof ScreenshotUploadError) return s.screenshotUploadFailed;
  if (error instanceof ApiError && error.status === 429) return s.rateLimited;
  if (error instanceof ApiError && error.status === 400) return s.invalid;
  return s.sendFailed;
}
