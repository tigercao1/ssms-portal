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

export type BugReportStatus = 'new' | 'in_progress' | 'resolved' | 'wont_fix';

export type BugReporterRole = 'admin' | 'instructor';

export interface BugReportItem {
  id: string;
  createdAt: string;
  status: BugReportStatus;
  severity: BugSeverity | null;
  description: string;
  expected: string | null;
  reporter: {
    id: string;
    name: string;
    email: string | null;
    role: BugReporterRole;
  };
  pageUrl: string;
  hasScreenshot: boolean;
}

export interface BugReportsPage {
  items: BugReportItem[];
  total: number;
}

export interface BugReportDetail extends BugReportItem {
  appVersion: string | null;
  viewport: string | null;
  userAgent: string | null;
  adminNote: string | null;
  updatedAt: string;
  screenshotUrl: string | null;
}

export interface UpdateBugReportBody {
  status?: BugReportStatus;
  adminNote?: string | null;
}
