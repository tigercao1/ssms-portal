import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeAdminList, fakeLessonType, fakePayRate, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { LessonTypesPage } from './LessonTypesPage';
import type { AdminInstructorRecord, LessonType, PayRate } from '@/lib/types';

const API = 'http://localhost:3000';

const jane = fakeAdminList[0] as AdminInstructorRecord;
const eddie: AdminInstructorRecord = {
  ...jane,
  id: 'inst-2',
  email: 'eddie@example.com',
  displayNameEn: 'Eddie Lee',
  displayNameZh: '李艾迪',
};

const privateType = fakeLessonType();
const promoType = fakeLessonType({
  id: 'lt2',
  nameEn: 'Promo 1-on-2 1h',
  nameZh: '12.24前特价课 一对二',
  groupSize: 2,
  durationMin: 60,
  isPromo: true,
  sortOrder: 1,
});
const anyType = fakeLessonType({
  id: 'lt3',
  nameEn: 'Group 4h',
  nameZh: null,
  groupSize: null,
  durationMin: 240,
  active: false,
  sortOrder: 2,
});

interface Calls {
  typePosts: unknown[];
  typePatches: { id: string; body: unknown }[];
  ratePosts: unknown[];
  ratePatches: { id: string; body: unknown }[];
}

function serve({
  types = [privateType, promoType, anyType],
  rates = [] as PayRate[],
  typeError,
  rateError,
}: {
  types?: LessonType[];
  rates?: PayRate[];
  typeError?: { status: number; message: string };
  rateError?: { status: number; message: string };
} = {}) {
  const calls: Calls = {
    typePosts: [],
    typePatches: [],
    ratePosts: [],
    ratePatches: [],
  };
  let storedTypes = [...types];
  let storedRates = [...rates];
  server.use(
    http.get(`${API}/admin/instructors`, () =>
      HttpResponse.json([jane, eddie]),
    ),
    http.get(`${API}/admin/lesson-types`, () => HttpResponse.json(storedTypes)),
    http.post(`${API}/admin/lesson-types`, async ({ request }) => {
      const body = (await request.json()) as Partial<LessonType>;
      calls.typePosts.push(body);
      if (typeError) {
        return HttpResponse.json(
          { message: typeError.message },
          { status: typeError.status },
        );
      }
      const created = fakeLessonType({ ...body, id: 'lt-new' });
      storedTypes = [...storedTypes, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API}/admin/lesson-types/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<LessonType>;
      calls.typePatches.push({ id: String(params.id), body });
      if (typeError) {
        return HttpResponse.json(
          { message: typeError.message },
          { status: typeError.status },
        );
      }
      storedTypes = storedTypes.map((t) =>
        t.id === params.id ? { ...t, ...body } : t,
      );
      return HttpResponse.json(storedTypes.find((t) => t.id === params.id));
    }),
    http.get(`${API}/admin/pay-rates`, () => HttpResponse.json(storedRates)),
    http.post(`${API}/admin/pay-rates`, async ({ request }) => {
      const body = (await request.json()) as Partial<PayRate>;
      calls.ratePosts.push(body);
      if (rateError) {
        return HttpResponse.json(
          { message: rateError.message },
          { status: rateError.status },
        );
      }
      const created = fakePayRate({ ...body, id: `pr-${storedRates.length}` });
      storedRates = [...storedRates, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API}/admin/pay-rates/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<PayRate>;
      calls.ratePatches.push({ id: String(params.id), body });
      if (rateError) {
        return HttpResponse.json(
          { message: rateError.message },
          { status: rateError.status },
        );
      }
      storedRates = storedRates.map((r) =>
        r.id === params.id ? { ...r, ...body } : r,
      );
      return HttpResponse.json(storedRates.find((r) => r.id === params.id));
    }),
  );
  return calls;
}

const OVERLAP_API =
  'This rate overlaps another rate for the same lesson type and instructor';
const OVERLAP_UI =
  'This rate overlaps another rate for the same lesson type and instructor. Change the dates, or end the other rate first.';

function row(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

describe('LessonTypesPage table', () => {
  it('lists types in sort order with names, size, duration, promo and status', async () => {
    serve();
    renderWithProviders(<LessonTypesPage />);

    expect(
      await screen.findByRole('heading', { name: 'Lesson types' }),
    ).toBeInTheDocument();
    await screen.findByText('Private 2h');
    const rows = screen.getAllByRole('row').slice(1);
    expect(
      rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent),
    ).toEqual(['Private 2h', 'Promo 1-on-2 1hPromo', 'Group 4h']);
    const promo = within(row('Promo 1-on-2 1h'));
    expect(promo.getByText('12.24前特价课 一对二')).toBeInTheDocument();
    expect(promo.getByText('2')).toBeInTheDocument();
    expect(promo.getByText('60 min')).toBeInTheDocument();
    expect(promo.getByText('Active')).toBeInTheDocument();
    const group = within(row('Group 4h'));
    expect(group.getByText('Any')).toBeInTheDocument();
    expect(group.getByText('240 min')).toBeInTheDocument();
    expect(group.getByText('Inactive')).toBeInTheDocument();
    expect(group.getByText('—')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    serve({ types: [] });
    renderWithProviders(<LessonTypesPage />);
    expect(
      await screen.findByText('No lesson types yet. Add the first one below.'),
    ).toBeInTheDocument();
  });

  it('shows the API error when the list fails', async () => {
    serve();
    server.use(
      http.get(`${API}/admin/lesson-types`, () =>
        HttpResponse.json({ message: 'Forbidden resource' }, { status: 403 }),
      ),
    );
    renderWithProviders(<LessonTypesPage />);
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
  });

  it('renders Chinese labels', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve();
    renderWithProviders(<LessonTypesPage />);
    expect(
      await screen.findByRole('heading', { name: '课程类型' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('不限')).toBeInTheDocument();
    expect(screen.getAllByText('特价').length).toBeGreaterThan(0);
  });
});

describe('LessonTypesPage editing', () => {
  it('edits a row in place and sends only the changed fields', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Edit Private 2h' }),
    );
    expect(
      screen.getByRole('button', { name: 'Edit Private 2h' }),
    ).toHaveAttribute('aria-expanded', 'true');
    const form = screen
      .getByRole('heading', { name: 'Edit lesson type' })
      .closest('form') as HTMLElement;
    const f = within(form);
    expect(f.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.clear(f.getByLabelText('Duration (minutes)', { exact: false }));
    await user.type(
      f.getByLabelText('Duration (minutes)', { exact: false }),
      '90',
    );
    await user.clear(f.getByLabelText('Students per lesson'));
    await user.click(f.getByRole('switch', { name: 'Promo lesson' }));
    await user.click(f.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(calls.typePatches).toEqual([
        {
          id: 'lt1',
          body: { groupSize: null, durationMin: 90, isPromo: true },
        },
      ]),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Edit lesson type' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await within(row('Private 2h')).findByText('90 min'),
    ).toBeInTheDocument();
  });

  it('validates numbers and shows the duplicate-name 409 on the field', async () => {
    const calls = serve({
      typeError: {
        status: 409,
        message: 'A lesson type with this English name already exists',
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Edit Promo 1-on-2 1h' }),
    );
    const form = screen
      .getByRole('heading', { name: 'Edit lesson type' })
      .closest('form') as HTMLElement;
    const f = within(form);
    const size = f.getByLabelText('Students per lesson');
    await user.clear(size);
    await user.type(size, '0');
    expect(
      f.getByText('Enter a whole number from 1 to 100, or leave empty.'),
    ).toBeInTheDocument();
    expect(f.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(size);
    await user.type(size, '3');

    const name = f.getByLabelText('English name', { exact: false });
    await user.clear(name);
    await user.type(name, 'Private 2h');
    await user.click(f.getByRole('button', { name: 'Save' }));

    expect(
      await f.findByText(
        'A lesson type with this English name already exists.',
      ),
    ).toBeInTheDocument();
    expect(calls.typePatches).toHaveLength(1);
  });

  it('shows the API message for other failures and closes on Cancel', async () => {
    serve({ typeError: { status: 400, message: 'Nothing to update' } });
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Edit Group 4h' }),
    );
    const form = screen
      .getByRole('heading', { name: 'Edit lesson type' })
      .closest('form') as HTMLElement;
    await user.click(within(form).getByRole('switch', { name: 'Active' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Nothing to update',
    );

    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('heading', { name: 'Edit lesson type' }),
    ).not.toBeInTheDocument();
  });
});

describe('LessonTypesPage add form', () => {
  function addForm() {
    return within(
      screen
        .getByRole('heading', { name: 'Add lesson type' })
        .closest('form') as HTMLElement,
    );
  }

  it('creates a lesson type with every field', async () => {
    const calls = serve({ types: [] });
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);
    await screen.findByText('No lesson types yet. Add the first one below.');

    const f = addForm();
    expect(f.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(
      f.getByLabelText('English name', { exact: false }),
      ' Private 1h ',
    );
    await user.type(f.getByLabelText('Chinese name'), '1对1滑雪课 - 1小时');
    await user.type(f.getByLabelText('Students per lesson'), '1');
    await user.click(f.getByRole('button', { name: 'Add' }));
    expect(
      f.getByText('Enter whole minutes from 1 to 1440.'),
    ).toBeInTheDocument();
    expect(calls.typePosts).toHaveLength(0);

    await user.type(
      f.getByLabelText('Duration (minutes)', { exact: false }),
      '60',
    );
    await user.clear(f.getByLabelText('Sort order'));
    await user.type(f.getByLabelText('Sort order'), '5');
    await user.click(f.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(calls.typePosts).toEqual([
        {
          nameEn: 'Private 1h',
          nameZh: '1对1滑雪课 - 1小时',
          groupSize: 1,
          durationMin: 60,
          isPromo: false,
          active: true,
          sortOrder: 5,
        },
      ]),
    );
    expect(await f.findByText('Lesson type added.')).toBeInTheDocument();
    expect(f.getByLabelText('English name', { exact: false })).toHaveValue('');
    expect(await screen.findByText('Private 1h')).toBeInTheDocument();
  });

  it('shows the duplicate-name message and other API errors', async () => {
    serve({
      typeError: {
        status: 409,
        message: 'A lesson type with this English name already exists',
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);
    await screen.findByText('Private 2h');
    const f = addForm();
    await user.type(
      f.getByLabelText('English name', { exact: false }),
      'Private 2h',
    );
    await user.type(
      f.getByLabelText('Duration (minutes)', { exact: false }),
      '120',
    );
    await user.click(f.getByRole('button', { name: 'Add' }));
    expect(
      await f.findByText(
        'A lesson type with this English name already exists.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a non-409 API error as a banner', async () => {
    serve({
      typeError: {
        status: 400,
        message: 'durationMin must not be greater than 1440',
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);
    await screen.findByText('Private 2h');
    const f = addForm();
    await user.type(f.getByLabelText('English name', { exact: false }), 'X');
    await user.type(
      f.getByLabelText('Duration (minutes)', { exact: false }),
      '30',
    );
    await user.click(f.getByRole('switch', { name: 'Promo lesson' }));
    await user.click(f.getByRole('button', { name: 'Add' }));
    expect(await f.findByRole('alert')).toHaveTextContent(
      'durationMin must not be greater than 1440',
    );
  });
});

describe('LessonTypesPage pay rates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T12:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const rates = [
    fakePayRate({
      id: 'pr-old',
      hourlyRate: 40,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-10-31',
    }),
    fakePayRate({
      id: 'pr-default',
      hourlyRate: 45,
      effectiveFrom: '2026-11-01',
    }),
    fakePayRate({
      id: 'pr-eddie',
      instructorId: 'inst-2',
      hourlyRate: 52.5,
      effectiveFrom: '2026-11-15',
      effectiveTo: '2027-04-30',
    }),
    fakePayRate({ id: 'pr-promo', lessonTypeId: 'lt2', hourlyRate: 30 }),
  ];

  const dailyRate = fakePayRate({
    id: 'pr-day',
    lessonTypeId: 'lt3',
    hourlyRate: 400,
    rateUnit: 'day',
  });

  async function openRates(name = 'Private 2h') {
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);
    const button = await screen.findByRole('button', {
      name: `Pay rates for ${name}`,
    });
    await waitFor(() => expect(button).toHaveTextContent('Pay rates (3)'));
    await user.click(button);
    const panel = screen.getByRole('region', { name: `Pay rates for ${name}` });
    return { user, panel: within(panel) };
  }

  it('counts rates per type and lists default first, then overrides', async () => {
    serve({ rates });
    const { panel } = await openRates();
    expect(
      screen.getByRole('button', { name: 'Pay rates for Promo 1-on-2 1h' }),
    ).toHaveTextContent('Pay rates (1)');

    const rows = panel.getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^DefaultCurrent\$45\.00\/h2026-11-01No end/),
      expect.stringMatching(/^Default\$40\.00\/h2026-01-012026-10-31/),
      expect.stringMatching(/^Eddie LeeCurrent\$52\.50\/h2026-11-152027-04-30/),
    ]);
    expect(rows[1]).not.toHaveTextContent('Current');
  });

  it('adds a default rate and an instructor override', async () => {
    const calls = serve({ types: [privateType], rates: [] });
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Pay rates for Private 2h' }),
    );
    const panel = within(
      screen.getByRole('region', { name: 'Pay rates for Private 2h' }),
    );
    expect(panel.getByText('No pay rates yet.')).toBeInTheDocument();

    await user.click(panel.getByRole('button', { name: 'Add pay rate' }));
    expect(
      panel.getByText('Enter an amount such as 45 or 52.50.'),
    ).toBeInTheDocument();
    expect(panel.getByText('Choose a start date.')).toBeInTheDocument();
    expect(calls.ratePosts).toHaveLength(0);

    await user.type(
      panel.getByLabelText('Rate', { exact: false, selector: 'input' }),
      '45',
    );
    await user.type(
      panel.getByLabelText('Effective from', { exact: false }),
      '2026-11-01',
    );
    await user.click(panel.getByRole('button', { name: 'Add pay rate' }));
    await waitFor(() =>
      expect(calls.ratePosts).toEqual([
        {
          lessonTypeId: 'lt1',
          instructorId: null,
          hourlyRate: 45,
          rateUnit: 'hour',
          currency: 'CAD',
          effectiveFrom: '2026-11-01',
          effectiveTo: null,
        },
      ]),
    );
    expect(await panel.findByText('Pay rate added.')).toBeInTheDocument();

    await user.selectOptions(panel.getByLabelText('Instructor'), 'inst-2');
    await user.type(
      panel.getByLabelText('Rate', { exact: false, selector: 'input' }),
      '52.50',
    );
    const currency = panel.getByLabelText('Currency');
    await user.clear(currency);
    await user.type(currency, 'usd');
    await user.type(
      panel.getByLabelText('Effective from', { exact: false }),
      '2026-12-01',
    );
    await user.type(panel.getByLabelText('Effective to'), '2027-03-31');
    await user.click(panel.getByRole('button', { name: 'Add pay rate' }));
    await waitFor(() =>
      expect(calls.ratePosts[1]).toEqual({
        lessonTypeId: 'lt1',
        instructorId: 'inst-2',
        hourlyRate: 52.5,
        rateUnit: 'hour',
        currency: 'USD',
        effectiveFrom: '2026-12-01',
        effectiveTo: '2027-03-31',
      }),
    );
    expect(
      await panel.findByRole('button', { name: 'Edit rate for Eddie Lee' }),
    ).toBeInTheDocument();
  });

  it('rejects an inverted range and a bad currency before calling the API', async () => {
    const calls = serve({ types: [privateType] });
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Pay rates for Private 2h' }),
    );
    const panel = within(
      screen.getByRole('region', { name: 'Pay rates for Private 2h' }),
    );
    await user.type(
      panel.getByLabelText('Rate', { exact: false, selector: 'input' }),
      '45',
    );
    await user.clear(panel.getByLabelText('Currency'));
    await user.type(panel.getByLabelText('Currency'), 'C1');
    await user.type(
      panel.getByLabelText('Effective from', { exact: false }),
      '2026-11-10',
    );
    await user.type(panel.getByLabelText('Effective to'), '2026-11-01');
    await user.click(panel.getByRole('button', { name: 'Add pay rate' }));
    expect(
      panel.getByText('The end date must be on or after the start date.'),
    ).toBeInTheDocument();
    expect(
      panel.getByText('Use a 3-letter code such as CAD.'),
    ).toBeInTheDocument();
    expect(calls.ratePosts).toHaveLength(0);
  });

  it('shows the 409 overlap error clearly when adding', async () => {
    serve({ rates, rateError: { status: 409, message: OVERLAP_API } });
    const { user, panel } = await openRates();
    await user.type(
      panel.getByLabelText('Rate', { exact: false, selector: 'input' }),
      '50',
    );
    await user.type(
      panel.getByLabelText('Effective from', { exact: false }),
      '2026-11-20',
    );
    await user.click(panel.getByRole('button', { name: 'Add pay rate' }));
    expect(await panel.findByRole('alert')).toHaveTextContent(OVERLAP_UI);
  });

  it('shows the API message for a 400 when adding', async () => {
    serve({
      rates,
      rateError: { status: 400, message: 'Instructor not found' },
    });
    const { user, panel } = await openRates();
    await user.type(
      panel.getByLabelText('Rate', { exact: false, selector: 'input' }),
      '50',
    );
    await user.type(
      panel.getByLabelText('Effective from', { exact: false }),
      '2026-11-20',
    );
    await user.click(panel.getByRole('button', { name: 'Add pay rate' }));
    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Instructor not found',
    );
  });

  it('edits a rate, sending only changed fields, e.g. ending it', async () => {
    const calls = serve({ rates });
    const { user, panel } = await openRates();
    await user.click(
      panel.getByRole('button', { name: 'Edit rate for Eddie Lee' }),
    );
    const form = within(
      panel
        .getByRole('heading', { name: 'Edit pay rate: Eddie Lee' })
        .closest('form') as HTMLElement,
    );
    expect(
      form.getByText('To change the instructor, add a new rate instead.'),
    ).toBeInTheDocument();
    expect(
      form.getByLabelText('Rate', { exact: false, selector: 'input' }),
    ).toHaveValue('52.5');
    expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.clear(form.getByLabelText('Effective to'));
    await user.type(form.getByLabelText('Effective to'), '2026-12-31');
    await user.clear(
      form.getByLabelText('Rate', { exact: false, selector: 'input' }),
    );
    await user.type(
      form.getByLabelText('Rate', { exact: false, selector: 'input' }),
      '55',
    );
    await user.click(form.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(calls.ratePatches).toEqual([
        { id: 'pr-eddie', body: { hourlyRate: 55, effectiveTo: '2026-12-31' } },
      ]),
    );
    await waitFor(() =>
      expect(
        panel.queryByRole('heading', { name: 'Edit pay rate: Eddie Lee' }),
      ).not.toBeInTheDocument(),
    );
    expect(await panel.findByText('2026-12-31')).toBeInTheDocument();
  });

  it('clears an end date to null and shows the 409 overlap error on edit', async () => {
    const calls = serve({
      rates,
      rateError: { status: 409, message: OVERLAP_API },
    });
    const { user, panel } = await openRates();
    const edits = panel.getAllByRole('button', {
      name: 'Edit rate for Default',
    });
    await user.click(edits[1] as HTMLElement);
    const form = within(
      panel
        .getByRole('heading', { name: 'Edit pay rate: Default' })
        .closest('form') as HTMLElement,
    );
    await user.clear(form.getByLabelText('Effective to'));
    await user.click(form.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(calls.ratePatches).toEqual([
        { id: 'pr-old', body: { effectiveTo: null } },
      ]),
    );
    expect(await form.findByRole('alert')).toHaveTextContent(OVERLAP_UI);

    await user.click(form.getByRole('button', { name: 'Cancel' }));
    expect(
      panel.queryByRole('heading', { name: 'Edit pay rate: Default' }),
    ).not.toBeInTheDocument();
  });

  it('shows the overlap message in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve({ rates, rateError: { status: 409, message: OVERLAP_API } });
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Private 2h 的费率' }),
    );
    const panel = within(
      screen.getByRole('region', { name: 'Private 2h 的费率' }),
    );
    await user.type(
      panel.getByLabelText('费率', { exact: false, selector: 'input' }),
      '50',
    );
    await user.type(
      panel.getByLabelText('生效日期', { exact: false, selector: 'input' }),
      '2026-11-20',
    );
    await user.click(panel.getByRole('button', { name: '添加费率' }));
    expect(await panel.findByRole('alert')).toHaveTextContent(
      '该费率与同一课程类型、同一教练的另一条费率时间重叠。',
    );
  });

  it('adds a daily rate and shows it per day', async () => {
    const calls = serve({ types: [privateType], rates: [] });
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Pay rates for Private 2h' }),
    );
    const panel = within(
      screen.getByRole('region', { name: 'Pay rates for Private 2h' }),
    );
    const unit = panel.getByLabelText('Unit');
    expect(unit).toHaveValue('hour');
    expect(
      within(unit)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Hourly', 'Daily']);

    await user.type(
      panel.getByLabelText('Rate', { exact: false, selector: 'input' }),
      '400',
    );
    await user.selectOptions(unit, 'day');
    await user.type(
      panel.getByLabelText('Effective from', { exact: false }),
      '2026-11-01',
    );
    await user.click(panel.getByRole('button', { name: 'Add pay rate' }));
    await waitFor(() =>
      expect(calls.ratePosts).toEqual([
        expect.objectContaining({ hourlyRate: 400, rateUnit: 'day' }),
      ]),
    );
    expect(await panel.findByText('$400.00/day')).toBeInTheDocument();
    expect(panel.getByLabelText('Unit')).toHaveValue('hour');
  });

  it('changes only the unit of an existing rate', async () => {
    const calls = serve({ rates: [...rates, dailyRate] });
    const { user, panel } = await openRates();
    await user.click(
      panel.getByRole('button', { name: 'Edit rate for Eddie Lee' }),
    );
    const form = within(
      panel
        .getByRole('heading', { name: 'Edit pay rate: Eddie Lee' })
        .closest('form') as HTMLElement,
    );
    expect(form.getByLabelText('Unit')).toHaveValue('hour');
    await user.selectOptions(form.getByLabelText('Unit'), 'day');
    await user.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.ratePatches).toEqual([
        { id: 'pr-eddie', body: { rateUnit: 'day' } },
      ]),
    );
    expect(await panel.findByText('$52.50/day')).toBeInTheDocument();
  });

  it('shows the units in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve({
      types: [anyType],
      rates: [
        dailyRate,
        fakePayRate({
          lessonTypeId: 'lt3',
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-10-31',
        }),
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<LessonTypesPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Group 4h 的费率' }),
    );
    const panel = within(
      screen.getByRole('region', { name: 'Group 4h 的费率' }),
    );
    expect(panel.getByText('CA$400.00/天')).toBeInTheDocument();
    expect(panel.getByText('CA$45.00/小时')).toBeInTheDocument();
    expect(
      within(panel.getByLabelText('计费方式'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['按小时', '按天']);
  });
});
