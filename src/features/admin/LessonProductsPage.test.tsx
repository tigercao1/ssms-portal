import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeAdminList, fakeLessonProduct, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { LessonProductsPage } from './LessonProductsPage';
import type {
  AdminInstructorRecord,
  LessonProduct,
  LessonProductStatus,
} from '@/lib/types';

const API = 'http://localhost:3000';

const jane = fakeAdminList[0] as AdminInstructorRecord;
const eddie: AdminInstructorRecord = {
  ...jane,
  id: 'inst-2',
  email: 'eddie@example.com',
  displayNameEn: 'Eddie Lee',
};

const privateSingle = fakeLessonProduct({
  id: 'lp1',
  productTitle: '一对一',
  variantTitle: '单次',
  durationMin: 120,
});
const semiFour = fakeLessonProduct({
  id: 'lp2',
  productTitle: '一对二',
  variantTitle: '四次',
  lessonType: 'semi_private',
  groupSize: 2,
  sessions: 4,
  durationMin: null,
  pricedPerStudent: true,
  price: 400,
  instructorId: 'inst-2',
});
const unknown = fakeLessonProduct({
  id: 'lp3',
  productTitle: 'Season insurance',
  variantTitle: null,
  lessonType: 'other',
  groupSize: null,
  sessions: null,
  instructorId: null,
  price: null,
});

function serve(initial: LessonProduct[]) {
  let rows = initial;
  const patches: { id: string; body: Record<string, unknown> }[] = [];
  const statusQueries: (string | null)[] = [];
  server.use(
    http.get(`${API}/admin/instructors`, () =>
      HttpResponse.json([jane, eddie]),
    ),
    http.get(`${API}/admin/lesson-products`, ({ request }) => {
      const status = new URL(request.url).searchParams.get('status');
      statusQueries.push(status);
      return HttpResponse.json(rows.filter((r) => r.status === status));
    }),
    http.patch(
      `${API}/admin/lesson-products/:id`,
      async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patches.push({ id: String(params.id), body });
        rows = rows.map((r) =>
          r.id === params.id ? ({ ...r, ...body } as LessonProduct) : r,
        );
        return HttpResponse.json(rows.find((r) => r.id === params.id));
      },
    ),
  );
  return { patches, statusQueries };
}

function rowFor(text: string) {
  return screen.getByText(text).closest('tr') as HTMLElement;
}

function panel() {
  return screen
    .getByRole('heading', { name: 'Edit lesson product' })
    .closest('tr') as HTMLElement;
}

describe('LessonProductsPage table', () => {
  it('lists suggested products read-only with price, type, size, sessions, duration and instructor', async () => {
    serve([privateSingle, semiFour]);
    renderWithProviders(<LessonProductsPage />);

    expect(await screen.findByText('一对二')).toBeInTheDocument();
    const semi = rowFor('一对二');
    expect(within(semi).getByText('四次')).toBeInTheDocument();
    expect(within(semi).getByText('Semi-private')).toBeInTheDocument();
    expect(within(semi).getByText('per student')).toBeInTheDocument();
    expect(within(semi).getByText(/400\.00/)).toBeInTheDocument();
    expect(within(semi).getByText('Eddie Lee')).toBeInTheDocument();
    expect(
      within(semi).getByText('Size 2 · Sessions 4 · —'),
    ).toBeInTheDocument();

    const single = rowFor('一对一');
    expect(within(single).getByText('Private')).toBeInTheDocument();
    expect(within(single).getByText(/120\.00/)).toBeInTheDocument();
    expect(
      within(single).getByText('Size 1 · Sessions 1 · 120 min'),
    ).toBeInTheDocument();
    expect(within(single).getByText('Jane Snow')).toBeInTheDocument();
    expect(within(single).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(single).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('switches tabs and asks the API for that status', async () => {
    const { statusQueries } = serve([
      privateSingle,
      { ...semiFour, status: 'confirmed' },
      { ...unknown, status: 'ignored' },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await screen.findByText('一对一');

    await user.click(screen.getByRole('tab', { name: 'Confirmed' }));
    expect(await screen.findByText('一对二')).toBeInTheDocument();
    expect(screen.queryByText('一对一')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Confirm 一对二/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /look complete/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Ignored' }));
    expect(await screen.findByText('Season insurance')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ignore Season insurance' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm Season insurance' }),
    ).toBeInTheDocument();

    expect(statusQueries).toEqual(['suggested', 'confirmed', 'ignored']);
  });

  it.each<[LessonProductStatus, string]>([
    [
      'suggested',
      'No suggested lesson products. Sync from Shopify to fetch them.',
    ],
    ['confirmed', 'No confirmed lesson products yet.'],
    ['ignored', 'No ignored lesson products.'],
  ])('shows an empty message on the %s tab', async (status, message) => {
    serve([]);
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    await user.click(screen.getByRole('tab', { name: label }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('shows the API error when the list fails to load', async () => {
    server.use(
      http.get(`${API}/admin/lesson-products`, () =>
        HttpResponse.json({ message: 'Forbidden resource' }, { status: 403 }),
      ),
    );
    renderWithProviders(<LessonProductsPage />);
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
  });

  it('confirms and ignores a single row', async () => {
    const { patches } = serve([privateSingle, semiFour]);
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await screen.findByText('一对一');

    await user.click(
      screen.getByRole('button', { name: 'Confirm 一对一 · 单次' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('一对一')).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole('button', { name: 'Ignore 一对二 · 四次' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('一对二')).not.toBeInTheDocument(),
    );

    expect(patches).toEqual([
      { id: 'lp1', body: { status: 'confirmed' } },
      { id: 'lp2', body: { status: 'ignored' } },
    ]);
  });

  it('shows the error when a row action fails', async () => {
    serve([privateSingle]);
    server.use(
      http.patch(`${API}/admin/lesson-products/:id`, () =>
        HttpResponse.json(
          { message: 'Lesson product not found' },
          { status: 404 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Confirm 一对一 · 单次' }),
    );
    expect(
      await screen.findByText('Lesson product not found'),
    ).toBeInTheDocument();
  });
});

describe('LessonProductsPage edit row', () => {
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('expands an edit form beneath the row with the current values and focuses the lesson type', async () => {
    serve([privateSingle, semiFour]);
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Edit 一对二 · 四次' }),
    );

    expect(rowFor('一对二').nextElementSibling).toBe(panel());
    expect(rowFor('一对二')).toHaveAttribute('aria-current', 'true');
    const form = within(panel());
    expect(form.getByLabelText('Lesson type')).toHaveValue('semi_private');
    expect(form.getByLabelText('Lesson type')).toHaveFocus();
    expect(form.getByLabelText('Students per lesson')).toHaveValue(2);
    expect(form.getByLabelText('Sessions')).toHaveValue(4);
    expect(form.getByLabelText('Duration (minutes)')).toHaveValue(null);
    expect(form.getByLabelText('Instructor')).toHaveValue('inst-2');
    expect(
      form.getByRole('switch', { name: 'Priced per student' }),
    ).toBeChecked();
    expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves only the changed fields and closes', async () => {
    const { patches } = serve([privateSingle, semiFour]);
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Edit 一对二 · 四次' }),
    );

    const form = within(panel());
    await user.type(form.getByLabelText('Duration (minutes)'), '90');
    await user.selectOptions(form.getByLabelText('Instructor'), 'inst-1');
    await user.selectOptions(form.getByLabelText('Lesson type'), 'group');
    await user.click(form.getByRole('switch', { name: 'Priced per student' }));
    await user.click(form.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Edit lesson product' }),
      ).not.toBeInTheDocument(),
    );
    expect(patches).toEqual([
      {
        id: 'lp2',
        body: {
          lessonType: 'group',
          durationMin: 90,
          instructorId: 'inst-1',
          pricedPerStudent: false,
        },
      },
    ]);
    expect(
      await screen.findByText('Size 2 · Sessions 4 · 90 min'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit 一对二 · 四次' }),
    ).toHaveFocus();
  });

  it('clears a number and the instructor to null', async () => {
    const { patches } = serve([semiFour]);
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Edit 一对二 · 四次' }),
    );
    const form = within(panel());
    await user.clear(form.getByLabelText('Students per lesson'));
    await user.selectOptions(form.getByLabelText('Instructor'), '');
    await user.click(form.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patches).toEqual([
        { id: 'lp2', body: { groupSize: null, instructorId: null } },
      ]),
    );
  });

  it('rejects invalid numbers and blocks saving', async () => {
    const { patches } = serve([privateSingle]);
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Edit 一对一 · 单次' }),
    );
    const form = within(panel());
    const sessions = form.getByLabelText('Sessions');
    await user.clear(sessions);
    await user.type(sessions, '0');

    expect(
      form.getByText('Enter a whole number above 0, or leave empty.'),
    ).toBeInTheDocument();
    expect(sessions).toHaveAttribute('aria-invalid', 'true');
    expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(patches).toEqual([]);
  });

  it('cancels with the button or Escape without saving', async () => {
    const { patches } = serve([privateSingle]);
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    const edit = await screen.findByRole('button', {
      name: 'Edit 一对一 · 单次',
    });

    await user.click(edit);
    await user.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('heading', { name: 'Edit lesson product' }),
    ).not.toBeInTheDocument();

    await user.click(edit);
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('heading', { name: 'Edit lesson product' }),
    ).not.toBeInTheDocument();
    expect(patches).toEqual([]);
  });

  it('shows the API error inside the panel when saving fails', async () => {
    serve([privateSingle]);
    server.use(
      http.patch(`${API}/admin/lesson-products/:id`, () =>
        HttpResponse.json(
          { message: 'sessions must be greater than 0' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Edit 一对一 · 单次' }),
    );
    const form = within(panel());
    await user.clear(form.getByLabelText('Duration (minutes)'));
    await user.type(form.getByLabelText('Duration (minutes)'), '60');
    await user.click(form.getByRole('button', { name: 'Save' }));

    expect(
      await form.findByText('sessions must be greater than 0'),
    ).toBeInTheDocument();
  });
});

describe('LessonProductsPage bulk confirm', () => {
  const complete = fakeLessonProduct({ id: 'lp4', durationMin: 60 });
  const alsoComplete = { ...semiFour, id: 'lp5', durationMin: 120 };
  const noDuration = fakeLessonProduct({
    id: 'lp6',
    productTitle: '团课',
    lessonType: 'group',
    groupSize: 6,
  });

  it('is disabled when no suggestion looks complete', async () => {
    serve([noDuration, unknown]);
    renderWithProviders(<LessonProductsPage />);
    await screen.findByText('团课');
    expect(
      screen.getByRole('button', {
        name: 'Confirm all suggested that look complete',
      }),
    ).toBeDisabled();
    expect(screen.getByText('None look complete yet.')).toBeInTheDocument();
  });

  it('asks first and sends nothing when cancelled', async () => {
    const { patches } = serve([complete, noDuration]);
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await screen.findAllByText('一对一');

    await user.click(
      screen.getByRole('button', {
        name: 'Confirm all suggested that look complete',
      }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Confirm 1 lesson products?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(patches).toEqual([]);
  });

  it('confirms only the complete suggestions after confirming', async () => {
    const { patches } = serve([complete, noDuration, alsoComplete, unknown]);
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await screen.findByText('Season insurance');
    expect(
      screen.getByText(
        '2 look complete (type, size, sessions, duration and instructor set).',
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Confirm all suggested that look complete',
      }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Confirm 2 lesson products?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Confirm 2' }));

    expect(
      await screen.findByText('Confirmed 2 lesson products.'),
    ).toBeInTheDocument();
    expect(patches).toEqual([
      { id: 'lp4', body: { status: 'confirmed' } },
      { id: 'lp5', body: { status: 'confirmed' } },
    ]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3));
  });

  it('reports a failure part-way and refreshes the list', async () => {
    serve([complete, alsoComplete]);
    server.use(
      http.patch(`${API}/admin/lesson-products/lp5`, () =>
        HttpResponse.json({ message: 'Conflict' }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await screen.findByText('一对二');
    await user.click(
      screen.getByRole('button', {
        name: 'Confirm all suggested that look complete',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm 2' }));

    expect(await screen.findByText('Conflict')).toBeInTheDocument();
  });
});

describe('LessonProductsPage sync', () => {
  it('shows the sync counts and refreshes the list', async () => {
    serve([]);
    let calls = 0;
    server.use(
      http.post(`${API}/admin/lesson-products/sync`, () => {
        calls += 1;
        return HttpResponse.json({ fetched: 12, created: 3, updated: 9 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await user.click(screen.getByRole('button', { name: 'Sync from Shopify' }));

    expect(await screen.findByText('Sync finished.')).toBeInTheDocument();
    expect(screen.getByText('Fetched:').textContent).toBe('Fetched: 12');
    expect(screen.getByText('Created:').textContent).toBe('Created: 3');
    expect(screen.getByText('Updated:').textContent).toBe('Updated: 9');
    expect(screen.queryByText(/Skipped/)).not.toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('shows the scope-missing error from the API', async () => {
    serve([]);
    server.use(
      http.post(`${API}/admin/lesson-products/sync`, () =>
        HttpResponse.json(
          { message: 'read_products scope missing' },
          { status: 502 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<LessonProductsPage />);
    await user.click(screen.getByRole('button', { name: 'Sync from Shopify' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sync failed');
    expect(alert).toHaveTextContent('read_products scope missing');
  });
});
