import { http, HttpResponse } from 'msw';
import type {
  BugReportBody,
  BugReportDetail,
  BugReportItem,
  BugReportStatus,
  ScreenshotUploadUrlBody,
  UpdateBugReportBody,
} from './types';

const API = 'http://localhost:3000';
export const MOCK_SCREENSHOT_ORIGIN = 'https://storage.mock';

export type MockCall =
  | { kind: 'screenshot-url'; body: ScreenshotUploadUrlBody }
  | {
      kind: 'upload';
      key: string;
      contentType: string | null;
      bytes: number;
    }
  | { kind: 'report'; body: BugReportBody };

export interface BugReportsMockState {
  calls: MockCall[];
  nextId: number;
  reportStatus: number | null;
  uploadStatus: number | null;
  presignStatus: number | null;
  reports: BugReportDetail[];
  listQueries: string[];
  detailRequests: string[];
  patches: { id: string; body: UpdateBugReportBody }[];
  patchStatus: number | null;
}

export function createBugReportsState(
  reports: BugReportDetail[] = fakeBugReports(),
): BugReportsMockState {
  return {
    calls: [],
    nextId: 1,
    reportStatus: null,
    uploadStatus: null,
    presignStatus: null,
    reports: structuredClone(reports),
    listQueries: [],
    detailRequests: [],
    patches: [],
    patchStatus: null,
  };
}

export function fakeBugReport(
  overrides: Partial<BugReportDetail> = {},
): BugReportDetail {
  return {
    id: 'bug-1',
    createdAt: '2026-11-18T23:30:00Z',
    updatedAt: '2026-11-18T23:30:00Z',
    status: 'new',
    severity: 'blocked',
    description:
      'The Save button on my profile spins forever after I change my bio.',
    expected: 'The bio saves and the page says Saved.',
    reporter: {
      id: 'auth-7',
      name: 'Jane Snow',
      email: 'jane@example.com',
      role: 'instructor',
    },
    pageUrl: 'http://localhost:3000/profile/edit?tab',
    hasScreenshot: true,
    appVersion: null,
    viewport: '390x844',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    adminNote: null,
    screenshotUrl: `${MOCK_SCREENSHOT_ORIGIN}/read/bug-reports/shot-1.jpg?sig=5min`,
    ...overrides,
  };
}

const MORE_STATUSES: BugReportStatus[] = [
  'in_progress',
  'resolved',
  'wont_fix',
  'new',
];

export function fakeBugReports(count = 3): BugReportDetail[] {
  const first = [
    fakeBugReport(),
    fakeBugReport({
      id: 'bug-2',
      createdAt: '2026-11-17T14:05:00Z',
      updatedAt: '2026-11-18T10:00:00Z',
      status: 'in_progress',
      severity: 'wrong',
      description: 'The payroll total on the class list is off by one lesson.',
      expected: null,
      reporter: {
        id: 'auth-1',
        name: 'Ada Admin',
        email: 'ada@ssnow.club',
        role: 'admin',
      },
      pageUrl: 'http://localhost:3000/admin/payroll?period',
      hasScreenshot: false,
      screenshotUrl: null,
      viewport: '1280x800',
      adminNote: 'Looking at the period boundary.',
    }),
    fakeBugReport({
      id: 'bug-3',
      createdAt: '2026-11-10T16:00:00Z',
      status: 'resolved',
      severity: null,
      description: 'Typo on the insurance page.',
      expected: null,
      pageUrl: 'https://evil.example/phish',
      hasScreenshot: false,
      screenshotUrl: null,
    }),
  ];
  const extra = Array.from(
    { length: Math.max(0, count - first.length) },
    (_, i) =>
      fakeBugReport({
        id: `bug-${i + 4}`,
        createdAt: new Date(Date.UTC(2026, 9, 30 - (i % 28), 12)).toISOString(),
        status: MORE_STATUSES[i % MORE_STATUSES.length],
        severity: 'minor',
        description: `Older report ${i + 4}`,
        hasScreenshot: false,
        screenshotUrl: null,
      }),
  );
  return [...first, ...extra].slice(0, count);
}

export function listItem(report: BugReportDetail): BugReportItem {
  return {
    id: report.id,
    createdAt: report.createdAt,
    status: report.status,
    severity: report.severity,
    description: report.description,
    expected: report.expected,
    reporter: report.reporter,
    pageUrl: report.pageUrl,
    hasScreenshot: report.hasScreenshot,
  };
}

export function adminBugReportHandlers(state: BugReportsMockState) {
  const find = (id: unknown) =>
    state.reports.find((report) => report.id === id);
  const notFound = () =>
    HttpResponse.json({ message: 'Bug report not found' }, { status: 404 });
  return [
    http.get(`${API}/admin/bug-reports`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      state.listQueries.push(params.toString());
      const status = params.get('status');
      const page = Number(params.get('page') ?? 1);
      const limit = Number(params.get('limit') ?? 25);
      const matching = state.reports
        .filter((report) => !status || report.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return HttpResponse.json({
        items: matching.slice((page - 1) * limit, page * limit).map(listItem),
        total: matching.length,
      });
    }),
    http.get(`${API}/admin/bug-reports/:id`, ({ params }) => {
      state.detailRequests.push(String(params.id));
      if (!/^bug-\d+$/.test(String(params.id)))
        return HttpResponse.json(
          { message: 'Validation failed (uuid is expected)' },
          { status: 400 },
        );
      const report = find(params.id);
      return report ? HttpResponse.json(report) : notFound();
    }),
    http.patch(`${API}/admin/bug-reports/:id`, async ({ params, request }) => {
      const body = (await request.json()) as UpdateBugReportBody;
      state.patches.push({ id: String(params.id), body });
      if (state.patchStatus)
        return HttpResponse.json(
          {
            message:
              'adminNote must be shorter than or equal to 2000 characters',
          },
          { status: state.patchStatus },
        );
      const report = find(params.id);
      if (!report) return notFound();
      Object.assign(report, body, { updatedAt: '2026-11-19T15:00:00Z' });
      return HttpResponse.json(report);
    }),
  ];
}

export function reportsSent(state: BugReportsMockState): BugReportBody[] {
  return state.calls.flatMap((call) =>
    call.kind === 'report' ? [call.body] : [],
  );
}

export function myBugReportHandlers(state: BugReportsMockState) {
  return [
    http.post(`${API}/me/bug-reports/screenshot-url`, async ({ request }) => {
      const body = (await request.json()) as ScreenshotUploadUrlBody;
      state.calls.push({ kind: 'screenshot-url', body });
      if (state.presignStatus)
        return HttpResponse.json(
          { message: 'ThrottlerException: Too Many Requests' },
          { status: state.presignStatus },
        );
      const key = `bug-reports/shot-${state.nextId}.jpg`;
      return HttpResponse.json({
        uploadUrl: `${MOCK_SCREENSHOT_ORIGIN}/upload/${key}?sig=mock`,
        key,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      });
    }),
    http.put(
      `${MOCK_SCREENSHOT_ORIGIN}/upload/bug-reports/:file`,
      async ({ params, request }) => {
        state.calls.push({
          kind: 'upload',
          key: `bug-reports/${String(params.file)}`,
          contentType: request.headers.get('Content-Type'),
          bytes: (await request.arrayBuffer()).byteLength,
        });
        return new HttpResponse(null, { status: state.uploadStatus ?? 200 });
      },
    ),
    http.post(`${API}/me/bug-reports`, async ({ request }) => {
      const body = (await request.json()) as BugReportBody;
      state.calls.push({ kind: 'report', body });
      if (state.reportStatus === 429)
        return HttpResponse.json(
          { message: 'ThrottlerException: Too Many Requests' },
          { status: 429 },
        );
      if (state.reportStatus)
        return HttpResponse.json(
          { message: 'Request failed' },
          { status: state.reportStatus },
        );
      const id = `bug-${state.nextId++}`;
      return HttpResponse.json(
        { id, createdAt: '2026-11-19T15:00:00Z' },
        { status: 201 },
      );
    }),
  ];
}
