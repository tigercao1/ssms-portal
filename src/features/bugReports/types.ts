export type BugSeverity = 'blocked' | 'wrong' | 'minor';

export type ScreenshotContentType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ScreenshotUploadUrlBody {
  contentType: ScreenshotContentType;
  contentLength: number;
}

export interface ScreenshotUploadUrl {
  uploadUrl: string;
  key: string;
  expiresAt: string;
}

export interface BugReportBody {
  description: string;
  expected?: string;
  severity?: BugSeverity;
  pageUrl: string;
  appVersion?: string;
  viewport?: string;
  userAgent?: string;
  screenshotKey?: string;
}

export interface CreatedBugReport {
  id: string;
  createdAt: string;
}
