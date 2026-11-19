import { http, HttpResponse } from 'msw';
import type { BugReportBody, ScreenshotUploadUrlBody } from './types';

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
}

export function createBugReportsState(): BugReportsMockState {
  return { calls: [], nextId: 1, reportStatus: null, uploadStatus: null };
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
