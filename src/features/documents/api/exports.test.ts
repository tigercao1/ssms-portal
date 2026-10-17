import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { ApiError } from '@/lib/api';
import {
  createDocumentExport,
  getDocumentExport,
  getDocumentExportUrl,
  listDocumentExports,
  listTemplateAssignments,
} from './index';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from './handlers';
import { fakeAssignment, fakeRoster } from './fixtures';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

const API = 'http://localhost:3000';
let state: DocumentsMockState;

beforeEach(() => {
  state = createDocumentsState();
  const roster = fakeRoster('tpl-conduct', 6, { completeEvery: 2 });
  Object.assign(state.instructors, roster.instructors);
  state.assignments.push(
    ...roster.assignments,
    fakeAssignment({
      id: 'asg-archived',
      templateId: 'tpl-conduct',
      status: 'archived',
    }),
  );
  server.use(...documentsHandlers(state));
});

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (err: unknown) => err as ApiError,
  );
}

describe('template assignment requests', () => {
  it('pages with X-Total-Count, completed first then open by last name', async () => {
    const page = await listTemplateAssignments('tpl-conduct', {
      page: 1,
      limit: 5,
    });
    expect(page.total).toBe(7);
    expect(page.rows).toHaveLength(5);
    expect(page.rows.map((r) => r.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
      'assigned',
    ]);
    const done = page.rows.slice(0, 4).map((r) => r.completedAt ?? '');
    expect(done).toEqual([...done].sort().reverse());
    expect(page.rows.map((r) => r.id)).not.toContain('asg-archived');
    expect(page.rows[0]!.instructor).toMatchObject({
      firstName: expect.any(String),
      email: expect.stringContaining('@example.com'),
    });
  });

  it('falls back to the rows seen when X-Total-Count is missing', async () => {
    server.use(
      http.get(`${API}/admin/documents/templates/:id/assignments`, () =>
        HttpResponse.json([]),
      ),
    );
    const page = await listTemplateAssignments('tpl-conduct', {
      page: 3,
      limit: 50,
    });
    expect(page).toEqual({ rows: [], page: 3, total: 100 });
  });

  it('404s an unknown template', async () => {
    const err = await rejection(
      listTemplateAssignments('nope', { page: 1, limit: 50 }),
    );
    expect(err.status).toBe(404);
  });
});

describe('export requests', () => {
  it('creates, polls, lists and signs a ready export', async () => {
    const created = await createDocumentExport('tpl-conduct', {
      assignmentIds: ['asg-conduct'],
    });
    expect(created).toMatchObject({ status: 'queued', selectedCount: 1 });
    await expect(getDocumentExportUrl(created.id)).rejects.toMatchObject({
      status: 409,
    });
    expect((await getDocumentExport(created.id)).status).toBe('running');
    const ready = await getDocumentExport(created.id);
    expect(ready).toMatchObject({ status: 'ready', fileCount: 1 });
    expect((await getDocumentExport(created.id)).status).toBe('ready');
    expect((await listDocumentExports('tpl-conduct')).map((e) => e.id)).toEqual(
      [created.id],
    );
    expect(await getDocumentExportUrl(created.id)).toMatchObject({
      url: `https://storage.mock/exports/${created.id}.zip?sig=mock`,
      sizeBytes: ready.sizeBytes,
    });
  });

  it('rejects read templates, foreign ids and empty matches', async () => {
    expect(
      (await rejection(createDocumentExport('tpl-handbook', {}))).status,
    ).toBe(400);
    expect(
      (
        await rejection(
          createDocumentExport('tpl-conduct', {
            assignmentIds: ['asg-waiver'],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await rejection(createDocumentExport('tpl-conduct', { season: '1999' })))
        .status,
    ).toBe(400);
    expect((await rejection(createDocumentExport('nope', {}))).status).toBe(
      404,
    );
  });

  it('410s an expired export', async () => {
    const created = await createDocumentExport('tpl-conduct', {});
    state.exports[0]!.status = 'expired';
    expect((await rejection(getDocumentExportUrl(created.id))).status).toBe(
      410,
    );
  });
});
