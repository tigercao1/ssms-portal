import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  fakeAdminList,
  fakeCustomer,
  fakeLessonType,
  server,
} from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import type { AdminInstructorRecord } from '@/lib/types';
import { formatSchoolDate, ImportHistoryPage } from './ImportHistoryPage';
import type {
  ClassImport,
  ClassImportDetail,
  ClassImportRow,
  ImportSummary,
} from './importTypes';

const API = 'http://localhost:3000';

const jane = fakeAdminList[0] as AdminInstructorRecord;
const eddie: AdminInstructorRecord = {
  ...jane,
  id: 'inst-2',
  email: 'eddie@example.com',
  displayNameEn: 'Eddie Lee',
};
const privateLesson = fakeLessonType();
const groupLesson = fakeLessonType({
  id: 'lt2',
  nameEn: 'Group 2h',
  nameZh: '团课 2小时',
  groupSize: 4,
});
const lily = fakeCustomer();

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    total: 3,
    matched: 1,
    willImport: 1,
    needsInstructor: 1,
    needsLessonType: 1,
    customerNotFound: 1,
    cancelled: 1,
    invalid: 0,
    duplicate: 0,
    alreadyImported: 0,
    imported: 0,
    ...overrides,
  };
}

function record(overrides: Partial<ClassImport> = {}): ClassImport {
  return {
    id: 'imp-1',
    filename: 'bookings.csv',
    status: 'draft',
    counts: { total: 3 },
    uploadedBy: 'admin-1',
    committedAt: null,
    createdAt: '2026-10-12T14:00:00.000Z',
    ...overrides,
  };
}

function row(overrides: Partial<ClassImportRow> = {}): ClassImportRow {
  return {
    rowNo: 1,
    externalId: '9000001',
    eventName: 'Private Lesson 2h',
    instructorName: 'Jane Snow',
    customerName: 'Test Customer',
    customerEmail: 'test.customer@example.com',
    customerPhone: null,
    startsAt: '2025-12-20T15:00:00.000Z',
    endsAt: '2025-12-20T17:00:00.000Z',
    statusToSet: 'completed',
    instructorId: 'inst-1',
    matchedInstructorName: 'Jane Snow',
    lessonTypeId: 'lt1',
    customerId: 'cu1',
    matchedCustomerName: 'Lily Chen',
    problems: [],
    manualFields: [],
    classId: null,
    ...overrides,
  };
}

function detail(overrides: Partial<ClassImportDetail> = {}): ClassImportDetail {
  return {
    import: record(),
    summary: summary(),
    eventNames: [
      { eventName: 'Group Lesson 2h', rows: 1, lessonTypeId: null },
      { eventName: 'Private Lesson 2h', rows: 2, lessonTypeId: 'lt1' },
    ],
    rows: [
      row(),
      row({
        rowNo: 2,
        externalId: '9000002',
        eventName: 'Group Lesson 2h',
        instructorName: 'Nobody Known',
        instructorId: null,
        matchedInstructorName: null,
        lessonTypeId: null,
        customerId: null,
        matchedCustomerName: null,
        problems: [
          'instructor_not_found',
          'lesson_type_unmapped',
          'customer_not_found',
        ],
      }),
      row({ rowNo: 3, externalId: '9000003', statusToSet: 'cancelled' }),
    ],
    ...overrides,
  };
}

interface Calls {
  details: (string | null)[];
  uploads: (string | null)[];
  patches: { rowNo: string; body: unknown }[];
  maps: unknown[];
  commits: number;
  discards: number;
}

function serve({
  imports = [record()],
  current = detail(),
  afterCommit,
}: {
  imports?: ClassImport[];
  current?: ClassImportDetail;
  afterCommit?: ClassImportDetail;
} = {}) {
  const calls: Calls = {
    details: [],
    uploads: [],
    patches: [],
    maps: [],
    commits: 0,
    discards: 0,
  };
  let list = imports;
  let shown = current;
  server.use(
    http.get(`${API}/admin/instructors`, () =>
      HttpResponse.json([jane, eddie]),
    ),
    http.get(`${API}/admin/lesson-types`, () =>
      HttpResponse.json([privateLesson, groupLesson]),
    ),
    http.get(`${API}/admin/customers`, () => HttpResponse.json([lily])),
    http.get(`${API}/admin/class-imports`, () => HttpResponse.json(list)),
    http.get(`${API}/admin/class-imports/:id`, ({ request }) => {
      const problem = new URL(request.url).searchParams.get('problem');
      calls.details.push(problem);
      return HttpResponse.json({
        ...shown,
        rows:
          problem && problem !== 'any'
            ? shown.rows.filter((r) =>
                (r.problems as string[]).includes(problem),
              )
            : shown.rows,
      });
    }),
    http.post(`${API}/admin/class-imports`, ({ request }) => {
      calls.uploads.push(request.headers.get('content-type'));
      list = [record(), ...list];
      return HttpResponse.json(shown, { status: 201 });
    }),
    http.patch(
      `${API}/admin/class-imports/:id/rows/:rowNo`,
      async ({ params, request }) => {
        calls.patches.push({
          rowNo: params.rowNo as string,
          body: await request.json(),
        });
        return HttpResponse.json(shown);
      },
    ),
    http.put(`${API}/admin/class-imports/event-map`, async ({ request }) => {
      calls.maps.push(await request.json());
      return HttpResponse.json({ mappings: [], rematchedImports: 1 });
    }),
    http.post(`${API}/admin/class-imports/:id/commit`, () => {
      calls.commits += 1;
      if (afterCommit) shown = afterCommit;
      return HttpResponse.json({
        import: shown.import,
        counts: shown.import.counts.commit,
      });
    }),
    http.post(`${API}/admin/class-imports/:id/discard`, () => {
      calls.discards += 1;
      shown = { ...shown, import: record({ status: 'discarded' }) };
      list = [record({ status: 'discarded' })];
      return HttpResponse.json(shown.import);
    }),
  );
  return calls;
}

const committed = detail({
  import: record({
    status: 'committed',
    committedAt: '2026-10-12T15:30:00.000Z',
    counts: {
      total: 3,
      commit: {
        total: 3,
        ready: 2,
        created: 2,
        alreadyImported: 0,
        participants: 1,
        skipped: 1,
      },
    },
  }),
  summary: summary({ imported: 2 }),
  rows: [row({ classId: 'class-1' })],
});

describe('ImportHistoryPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty state until a CSV is uploaded, then opens the draft', async () => {
    const calls = serve({ imports: [] });
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    expect(await screen.findByText('No import open')).toBeInTheDocument();
    expect(screen.getByText('No imports yet.')).toBeInTheDocument();
    const upload = screen.getByRole('button', { name: 'Upload' });
    expect(upload).toBeDisabled();

    const file = new File(['id,event.name\n'], 'bookings.csv', {
      type: 'text/csv',
    });
    const append = vi.spyOn(FormData.prototype, 'append');
    await user.upload(screen.getByLabelText('CSV file'), file);
    await user.click(upload);

    expect(
      await screen.findByRole('heading', { name: 'Summary' }),
    ).toBeInTheDocument();
    expect(calls.uploads).toHaveLength(1);
    expect(calls.uploads[0]).toMatch(/^multipart\/form-data; boundary=/);
    expect(append).toHaveBeenCalledWith('file', file);
    const tiles = screen.getByText('Needs instructor').closest('div');
    expect(within(tiles as HTMLElement).getByText('1')).toBeInTheDocument();
    for (const label of [
      'Matched',
      'Needs lesson type',
      'Customer not found',
      'Cancelled',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Invalid rows')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Open import bookings.csv' }),
    ).toBeDisabled();
  });

  it('refuses files over 5 MB before uploading', async () => {
    const calls = serve({ imports: [] });
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.csv', {
      type: 'text/csv',
    });
    await user.upload(await screen.findByLabelText('CSV file'), big);

    expect(
      screen.getByText('The file is larger than 5 MB.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(calls.uploads).toHaveLength(0);
  });

  it.each([
    [
      400,
      { message: 'The CSV is missing columns: id' },
      'The CSV is missing columns: id',
    ],
    [413, { message: 'File too large' }, 'The file is larger than 5 MB.'],
  ])('shows a %s upload error', async (status, body, text) => {
    serve({ imports: [] });
    server.use(
      http.post(`${API}/admin/class-imports`, () =>
        HttpResponse.json(body, { status }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    await user.upload(
      await screen.findByLabelText('CSV file'),
      new File(['x'], 'x.csv', { type: 'text/csv' }),
    );
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Upload failed')).toBeInTheDocument();
    expect(within(alert).getByText(text)).toBeInTheDocument();
  });

  it('opens the latest draft and lists rows with problems in school time', async () => {
    const calls = serve();
    renderWithProviders(<ImportHistoryPage />);

    const instructorSelect = await screen.findByLabelText(
      'Instructor for row 2',
    );
    expect(instructorSelect).toHaveValue('');
    expect(calls.details[0]).toBe('any');
    const rowTwo = instructorSelect.closest('tr') as HTMLElement;
    expect(within(rowTwo).getByText('CSV: Nobody Known')).toBeInTheDocument();
    expect(
      within(rowTwo).getByText('Instructor not found'),
    ).toBeInTheDocument();
    expect(
      within(rowTwo).getByText('Lesson type not mapped'),
    ).toBeInTheDocument();
    expect(within(rowTwo).getByText('No participant')).toBeInTheDocument();
    const rowOne = screen
      .getByLabelText('Instructor for row 1')
      .closest('tr') as HTMLElement;
    expect(within(rowOne).getByText('Lily Chen')).toBeInTheDocument();
    expect(
      within(rowOne).getByText(
        formatSchoolDate('2025-12-20T15:00:00.000Z', 'en'),
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOne).getByText(/^10:00\sa\.m\.\s–\s12:00\sp\.m\.$/),
    ).toBeInTheDocument();
    const cancelledRow = screen
      .getByLabelText('Instructor for row 3')
      .closest('tr') as HTMLElement;
    expect(within(cancelledRow).getByText('Cancelled')).toBeInTheDocument();
  });

  it('filters rows by problem', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    await screen.findByLabelText('Instructor for row 1');
    await user.selectOptions(
      screen.getByLabelText('Show'),
      'Instructor not found',
    );

    await waitFor(() =>
      expect(
        screen.queryByLabelText('Instructor for row 1'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Instructor for row 2')).toBeInTheDocument();
    expect(calls.details).toContain('instructor_not_found');

    await user.selectOptions(screen.getByLabelText('Show'), 'Duplicate CSV id');
    expect(
      await screen.findByText('No rows match this filter.'),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Show'), 'All rows');
    expect(
      await screen.findByLabelText('Instructor for row 1'),
    ).toBeInTheDocument();
    expect(calls.details).toContain(null);
  });

  it('saves only the changed event mappings', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    const save = await screen.findByRole('button', { name: 'Save mappings' });
    expect(save).toBeDisabled();
    const group = screen.getByLabelText('Lesson type for Group Lesson 2h');
    await user.selectOptions(group, 'Group 2h');
    await user.selectOptions(
      screen.getByLabelText('Lesson type for Private Lesson 2h'),
      'Not mapped',
    );
    await user.click(save);

    expect(await screen.findByText('Mappings saved.')).toBeInTheDocument();
    expect(calls.maps).toEqual([
      {
        mappings: [
          { eventName: 'Group Lesson 2h', lessonTypeId: 'lt2' },
          { eventName: 'Private Lesson 2h', lessonTypeId: null },
        ],
      },
    ]);
  });

  it('reports a failed mapping save', async () => {
    serve();
    server.use(
      http.put(`${API}/admin/class-imports/event-map`, () =>
        HttpResponse.json(
          { message: 'Lesson type not found' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    await user.selectOptions(
      await screen.findByLabelText('Lesson type for Group Lesson 2h'),
      'Group 2h',
    );
    await user.click(screen.getByRole('button', { name: 'Save mappings' }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('Could not save mappings'),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText('Lesson type not found'),
    ).toBeInTheDocument();
  });

  it('fixes a row with the instructor, lesson type and customer selects', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    await user.selectOptions(
      await screen.findByLabelText('Instructor for row 2'),
      'Eddie Lee',
    );
    await waitFor(() => expect(calls.patches).toHaveLength(1));
    await user.selectOptions(
      screen.getByLabelText('Lesson type for row 2'),
      'Group 2h',
    );
    await waitFor(() => expect(calls.patches).toHaveLength(2));

    await user.click(
      screen.getByRole('button', { name: 'Find a customer for row 2' }),
    );
    expect(screen.getByLabelText('Search customers')).toHaveValue(
      'test.customer@example.com',
    );
    await user.clear(screen.getByLabelText('Search customers'));
    await user.type(screen.getByLabelText('Search customers'), 'lily');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const picker = await screen.findByLabelText('Customer for row 2');
    await within(picker).findByText('Lily Chen · lily@example.com');
    await user.selectOptions(picker, 'Lily Chen · lily@example.com');
    await waitFor(() => expect(calls.patches).toHaveLength(3));

    await user.click(
      screen.getByRole('button', { name: 'Find a customer for row 1' }),
    );
    await user.selectOptions(
      await screen.findByLabelText('Customer for row 1'),
      'No participant',
    );
    await waitFor(() => expect(calls.patches).toHaveLength(4));

    expect(calls.patches).toEqual([
      { rowNo: '2', body: { instructorId: 'inst-2' } },
      { rowNo: '2', body: { lessonTypeId: 'lt2' } },
      { rowNo: '2', body: { customerId: 'cu1' } },
      { rowNo: '1', body: { customerId: null } },
    ]);

    await user.click(
      screen.getByRole('button', { name: 'Find a customer for row 3' }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByLabelText('Customer for row 3'),
    ).not.toBeInTheDocument();
  });

  it('shows which row failed to update', async () => {
    serve();
    server.use(
      http.patch(`${API}/admin/class-imports/:id/rows/:rowNo`, () =>
        HttpResponse.json({ message: 'Instructor not found' }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    await user.selectOptions(
      await screen.findByLabelText('Instructor for row 2'),
      'Eddie Lee',
    );

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('Could not update row 2'),
    ).toBeInTheDocument();
  });

  it('commits after confirming and shows the result', async () => {
    const calls = serve({ afterCommit: committed });
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Import 1 classes' }),
    );
    expect(screen.getByText('Import 1 classes now?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls.commits).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Import 1 classes' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText(
        'Imported 2 classes, 1 with a customer. 0 were already imported and 1 rows were skipped.',
      ),
    ).toBeInTheDocument();
    expect(calls.commits).toBe(1);
    expect(
      screen.queryByRole('button', { name: /^Import \d+ classes$/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Instructor for row 1')).toBeDisabled();
    expect(
      screen.getByLabelText('Lesson type for Private Lesson 2h'),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save mappings' }),
    ).not.toBeInTheDocument();
  });

  it('disables commit when nothing would import', async () => {
    serve({ current: detail({ summary: summary({ willImport: 0 }) }) });
    renderWithProviders(<ImportHistoryPage />);
    expect(
      await screen.findByRole('button', { name: 'Import 0 classes' }),
    ).toBeDisabled();
  });

  it('surfaces a commit failure', async () => {
    serve();
    server.use(
      http.post(`${API}/admin/class-imports/:id/commit`, () =>
        HttpResponse.json(
          { message: 'This import is no longer a draft' },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Import 1 classes' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Commit failed')).toBeInTheDocument();
    expect(
      within(alert).getByText('This import is no longer a draft'),
    ).toBeInTheDocument();
  });

  it('discards a draft after confirming', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Discard draft' }),
    );
    expect(
      screen.getByText('Discard this draft? It can no longer be committed.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText('This import was discarded.'),
    ).toBeInTheDocument();
    expect(calls.discards).toBe(1);
  });

  it('reports a failed discard', async () => {
    serve();
    server.use(
      http.post(`${API}/admin/class-imports/:id/discard`, () =>
        HttpResponse.json({ message: 'nope' }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Discard draft' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('Could not discard the draft'),
    ).toBeInTheDocument();
  });

  it('opens an older import from the recent list', async () => {
    const older = record({
      id: 'imp-0',
      filename: 'older.csv',
      status: 'committed',
      counts: {},
    });
    serve({
      imports: [record({ status: 'committed' }), older],
      current: committed,
    });
    const user = userEvent.setup();
    renderWithProviders(<ImportHistoryPage />);

    expect(await screen.findByText('No import open')).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(within(list).getAllByText('Committed')).toHaveLength(2);
    await user.click(
      screen.getByRole('button', { name: 'Open import older.csv' }),
    );

    expect(
      await screen.findByText(/This import was committed on/),
    ).toBeInTheDocument();
  });

  it('shows a load error for the open import', async () => {
    serve();
    server.use(
      http.get(`${API}/admin/class-imports/:id`, () =>
        HttpResponse.json(
          { message: 'Class import not found' },
          { status: 404 },
        ),
      ),
    );
    renderWithProviders(<ImportHistoryPage />);

    expect(
      await screen.findByText('Class import not found'),
    ).toBeInTheDocument();
  });

  it('shows extra counters and marks hand-set fields', async () => {
    serve({
      current: detail({
        summary: summary({ invalid: 1, duplicate: 2, alreadyImported: 3 }),
        rows: [
          row({
            manualFields: ['instructor', 'lesson_type', 'customer'],
            problems: ['already_imported', 'duplicate_row'],
            startsAt: null,
            endsAt: null,
            statusToSet: null,
            customerEmail: null,
            customerPhone: '647 555 0100',
          }),
        ],
      }),
    });
    renderWithProviders(<ImportHistoryPage />);

    expect(await screen.findByText('Invalid rows')).toBeInTheDocument();
    expect(screen.getByText('Duplicate rows')).toBeInTheDocument();
    expect(screen.getAllByText('Already imported').length).toBeGreaterThan(0);
    const rowOne = screen
      .getByLabelText('Instructor for row 1')
      .closest('tr') as HTMLElement;
    expect(within(rowOne).getByText('Duplicate CSV id')).toBeInTheDocument();
    expect(
      within(rowOne).getByText('CSV: Jane Snow · set by hand'),
    ).toBeInTheDocument();
    expect(
      within(rowOne).getByText('CSV: Test Customer · 647 555 0100'),
    ).toBeInTheDocument();
  });
});
