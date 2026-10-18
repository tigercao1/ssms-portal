import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { InsurancePage } from './InsurancePage';
import {
  createInsuranceState,
  insuranceHandlers,
  insuranceRecord,
  myInsurance,
  SEASON_2025,
  withHistory,
  type InsuranceMockState,
} from './fixtures';
import type { MyInsurance } from './types';

let state: InsuranceMockState;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-20T17:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const RECORDS_URL = 'http://localhost:3000/me/insurance/records';

function serve(data: MyInsurance, otherSeasons: MyInsurance[] = []) {
  state = createInsuranceState(data, otherSeasons);
  server.use(...insuranceHandlers(state));
}

function failNextRegistration() {
  server.use(
    http.post(
      RECORDS_URL,
      async ({ request }) => {
        state.posts.push((await request.json()) as never);
        return HttpResponse.json({ message: 'boom' }, { status: 500 });
      },
      { once: true },
    ),
  );
}

async function renderPage(locale: 'en' | 'zh-CN' = 'en') {
  if (locale === 'zh-CN') localStorage.setItem('ssms.locale', 'zh-CN');
  const user = userEvent.setup();
  renderWithProviders(<InsurancePage />, { route: '/insurance' });
  await screen.findByRole('heading', {
    level: 1,
    name: locale === 'en' ? 'Private lesson insurance' : '私课保险登记',
  });
  const date = screen.queryByLabelText(
    locale === 'en' ? 'Lesson date' : '上课日期',
  );
  if (date)
    await waitFor(() =>
      expect(
        (date as HTMLInputElement).value !== '' ||
          screen.queryByTestId('date-hint') !== null,
      ).toBe(true),
    );
  return user;
}

function nameInput(n: number) {
  return screen.getByRole('textbox', { name: `Student ${n} name` });
}

function waiver(n: number) {
  return screen.getByRole('checkbox', { name: `Student ${n} waiver signed` });
}

async function fillStudents(
  user: ReturnType<typeof userEvent.setup>,
  names: string[],
) {
  for (let i = 0; i < names.length; i++) {
    if (i > 0)
      await user.click(screen.getByRole('button', { name: '＋ Add student' }));
    await user.type(nameInput(i + 1), names[i]!);
    await user.click(waiver(i + 1));
  }
}

function submitButton() {
  return screen.getByRole('button', { name: /^Register( ·| for free|$)/ });
}

describe('InsurancePage header and form', () => {
  it('shows the exact header copy, the season badge and today as the date', async () => {
    serve(myInsurance());
    await renderPage();
    expect(
      screen.getByText(
        'Register each private lesson before you teach it and pay its insurance. Insurance is $10 per hour per student, capped at $400 per season.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Insurance season')).toBeInTheDocument();
    expect(screen.getByTestId('season-badge')).toHaveTextContent('2026/27');
    expect(screen.getByLabelText('Lesson date')).toHaveValue('2026-12-20');
    expect(screen.getByRole('button', { name: '1 hour' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('price-amount')).toHaveTextContent('$10');
    expect(submitButton()).toHaveTextContent('Register · $10 due');
  });

  it('prices 5 students for 2 hours at $80 with the over-4 note', async () => {
    serve(myInsurance());
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: '2 hours' }));
    expect(screen.getByTestId('price-breakdown')).toHaveTextContent(
      '$10 × 2 hours × 1 student',
    );
    expect(screen.getByTestId('price-amount')).toHaveTextContent('$20');
    await fillStudents(user, ['A', 'B', 'C', 'D']);
    expect(screen.getByTestId('price-amount')).toHaveTextContent('$80');
    expect(
      screen.queryByText('More than 4 students are charged as 4'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '＋ Add student' }));
    expect(screen.getAllByTestId('student-row')).toHaveLength(5);
    expect(screen.getByTestId('price-breakdown')).toHaveTextContent(
      '$10 × 2 hours × 4 students',
    );
    expect(screen.getByTestId('price-amount')).toHaveTextContent('$80');
    expect(
      screen.getByText('More than 4 students are charged as 4'),
    ).toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Register · $80 due');
  });

  it('keeps submit disabled with the waiver message until every name and waiver is done', async () => {
    serve(myInsurance());
    const user = await renderPage();
    const message = "Please confirm every student's waiver is signed";
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove student 1' }),
    ).toBeDisabled();

    await user.type(nameInput(1), 'Wei Zhang');
    expect(submitButton()).toBeDisabled();
    await user.click(waiver(1));
    expect(submitButton()).toBeEnabled();
    expect(screen.queryByText(message)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '＋ Add student' }));
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(nameInput(2)).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput(1)).toHaveAttribute('aria-invalid', 'false');
    await user.click(waiver(2));
    expect(submitButton()).toBeDisabled();
    await user.type(nameInput(2), '  ');
    expect(submitButton()).toBeDisabled();
    await user.type(nameInput(2), 'Amy Li');
    expect(submitButton()).toBeEnabled();
    await user.click(waiver(1));
    expect(submitButton()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove student 1' }));
    expect(screen.getAllByTestId('student-row')).toHaveLength(1);
    expect(nameInput(1)).toHaveValue('  Amy Li');
    expect(submitButton()).toBeEnabled();
  });

  it('registers a lesson, toasts the record and resets to one empty row', async () => {
    serve(withHistory);
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: '2 hours' }));
    await user.selectOptions(screen.getByLabelText(/Ski area/), 'Other');
    await user.type(
      screen.getByRole('textbox', { name: 'Ski area name' }),
      ' Mont Tremblant ',
    );
    await fillStudents(user, [' Wei Zhang ', 'Amy Li']);
    await user.click(submitButton());
    expect(
      await screen.findByText('Registered INS-20261015-0001 · $40 due'),
    ).toBeInTheDocument();
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0]).toEqual({
      lessonDate: '2026-12-20',
      durationHours: 2,
      locationOther: 'Mont Tremblant',
      students: [
        { name: 'Wei Zhang', waiverConfirmed: true },
        { name: 'Amy Li', waiverConfirmed: true },
      ],
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(screen.getAllByTestId('student-row')).toHaveLength(1);
    expect(nameInput(1)).toHaveValue('');
    expect(waiver(1)).not.toBeChecked();
    await waitFor(() =>
      expect(screen.getByTestId('cap-total')).toHaveTextContent(
        'Season total $90 / $400',
      ),
    );
    await fillStudents(user, ['Leo']);
    await user.click(submitButton());
    await screen.findByText('Registered INS-20261015-0002 · $20 due');
    expect(state.posts[1]!.idempotencyKey).not.toBe(
      state.posts[0]!.idempotencyKey,
    );
  });

  it('sends a picked ski area by id', async () => {
    serve(myInsurance());
    const user = await renderPage();
    await user.selectOptions(
      await screen.findByLabelText(/Ski area/),
      'Whistler',
    );
    await fillStudents(user, ['Wei']);
    await user.click(submitButton());
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0]).toMatchObject({ locationId: 'l1' });
    expect(state.posts[0]).not.toHaveProperty('locationOther');
  });

  it('explains no_season and waiver_unconfirmed errors from the API', async () => {
    serve(myInsurance());
    server.use(
      http.post('http://localhost:3000/me/insurance/records', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            code: 'no_season',
            message: 'No season covers this date',
          },
          { status: 400 },
        ),
      ),
    );
    const user = await renderPage('zh-CN');
    await user.type(
      screen.getByRole('textbox', { name: '学生 1 姓名' }),
      '张伟',
    );
    await user.click(
      screen.getByRole('checkbox', { name: '学生 1 Waiver 已签' }),
    );
    await user.click(screen.getByRole('button', { name: '登记 · 应付 $10' }));
    expect(
      await screen.findByText('没有雪季包含这一天，请检查上课日期。'),
    ).toBeInTheDocument();
    server.use(
      http.post('http://localhost:3000/me/insurance/records', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            code: 'waiver_unconfirmed',
            message: '请确认每位学生的 waiver 已签署',
            indexes: [0],
          },
          { status: 400 },
        ),
      ),
    );
    await user.click(screen.getByRole('button', { name: '登记 · 应付 $10' }));
    await waitFor(() =>
      expect(
        screen.getAllByText('请确认每位学生的 waiver 已签署'),
      ).toHaveLength(1),
    );
    expect(screen.getByRole('textbox', { name: '学生 1 姓名' })).toHaveValue(
      '张伟',
    );
  });

  it('copies the exact Chinese and English waiver links and toasts', async () => {
    serve(myInsurance());
    const user = await renderPage();
    await user.click(
      screen.getByRole('button', { name: 'Copy Chinese waiver link' }),
    );
    await expect(navigator.clipboard.readText()).resolves.toBe(
      'https://ssnow.club/pages/waiver',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
    await user.click(
      screen.getByRole('button', { name: 'Copy English waiver link' }),
    );
    await expect(navigator.clipboard.readText()).resolves.toBe(
      'https://ssnow.club/en/pages/waiver',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('toasts in Chinese when a waiver link is copied', async () => {
    serve(myInsurance());
    const user = await renderPage('zh-CN');
    await user.click(
      screen.getByRole('button', { name: '复制中文 Waiver 链接' }),
    );
    await expect(navigator.clipboard.readText()).resolves.toBe(
      'https://ssnow.club/pages/waiver',
    );
    expect(screen.getByRole('status')).toHaveTextContent('已复制');
    await user.click(
      screen.getByRole('button', { name: '复制英文 Waiver 链接' }),
    );
    await expect(navigator.clipboard.readText()).resolves.toBe(
      'https://ssnow.club/en/pages/waiver',
    );
  });
});

describe('InsurancePage cap', () => {
  it('charges the remainder when a lesson crosses the cap, with no modal', async () => {
    serve(myInsurance({ owedCents: 38000, paidCents: 38000 }));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: '2 hours' }));
    expect(screen.queryByTestId('cap-breakdown')).not.toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Register · $20 due');
    await fillStudents(user, ['Wei Zhang', 'Amy Li']);
    expect(screen.getByTestId('price-breakdown')).toHaveTextContent(
      '$10 × 2 hours × 2 students',
    );
    expect(screen.getByTestId('cap-breakdown')).toHaveTextContent(
      'List $40 · due after cap $20',
    );
    expect(screen.getByTestId('price-amount')).toHaveTextContent('$20');
    expect(submitButton()).toHaveTextContent('Register · $20 due');
    await user.click(submitButton());
    expect(
      await screen.findByText('Registered INS-20261015-0001 · $20 due'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0]).not.toHaveProperty('topUp');
    expect(state.data.records[0]).toMatchObject({
      coverage: 'cap_top_up',
      amountCents: 2000,
    });
    await waitFor(() =>
      expect(screen.getByTestId('cap-status')).toHaveTextContent(
        'Your insurance is capped for this season. Later registrations are free.',
      ),
    );
    expect(submitButton()).toHaveTextContent('Register for free');
    expect(screen.getByTestId('price-amount')).toHaveTextContent('$0');
    await fillStudents(user, ['Leo Chen']);
    await user.click(submitButton());
    expect(
      await screen.findByText('Registered INS-20261015-0002 · free'),
    ).toBeInTheDocument();
  });

  it("charges the remainder from the lesson's own season", async () => {
    serve(myInsurance(), [
      myInsurance({ season: SEASON_2025, owedCents: 39500 }),
    ]);
    const user = await renderPage();
    const date = screen.getByLabelText('Lesson date');
    await user.clear(date);
    await user.type(date, '2026-02-15');
    await waitFor(() =>
      expect(screen.getByTestId('cap-breakdown')).toHaveTextContent(
        'List $10 · due after cap $5',
      ),
    );
    expect(submitButton()).toHaveTextContent('Register · $5 due');
  });

  it('registers for free at $0 once capped', async () => {
    serve(
      myInsurance({ owedCents: 40000, paidCents: 40000, coverage: 'capped' }),
    );
    const user = await renderPage();
    expect(screen.getByTestId('price-amount')).toHaveTextContent('$0');
    expect(screen.getByText('This season is capped')).toBeInTheDocument();
    expect(screen.queryByTestId('price-breakdown')).not.toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Register for free');
    await fillStudents(user, ['Wei Zhang']);
    await user.click(submitButton());
    expect(
      await screen.findByText('Registered INS-20261015-0001 · free'),
    ).toBeInTheDocument();
  });

  it('shows the season pass as active and the lesson free', async () => {
    serve(
      myInsurance({
        owedCents: 40000,
        unpaidCents: 40000,
        coverage: 'season_pass',
      }),
    );
    await renderPage();
    expect(screen.getByTestId('price-amount')).toHaveTextContent('$0');
    expect(screen.getAllByText('Season pass is active')).toHaveLength(2);
    expect(screen.getByTestId('cap-status')).toHaveTextContent(
      'Season pass is active',
    );
    expect(submitButton()).toHaveTextContent('Register for free');
  });

  it('offers no way to buy a season pass', async () => {
    serve(withHistory);
    await renderPage();
    expect(
      screen.queryByRole('heading', { name: 'Season pass' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /season pass/i }),
    ).not.toBeInTheDocument();
  });

  it("prices a lesson in another, uncovered season from that season's coverage", async () => {
    serve(
      myInsurance({ owedCents: 40000, paidCents: 40000, coverage: 'capped' }),
    );
    const user = await renderPage();
    const date = screen.getByLabelText('Lesson date');
    await user.clear(date);
    await user.type(date, '2027-12-05');
    await waitFor(() =>
      expect(screen.getByTestId('price-amount')).toHaveTextContent('$10'),
    );
    expect(submitButton()).toHaveTextContent('Register · $10 due');
    expect(state.seasonGets).toContain('2027/28');
  });

  it('quotes $0 for a lesson in a previous season that has a season pass', async () => {
    serve(myInsurance(), [
      myInsurance({
        season: SEASON_2025,
        owedCents: 40000,
        unpaidCents: 40000,
        coverage: 'season_pass',
      }),
    ]);
    const user = await renderPage();
    const date = screen.getByLabelText('Lesson date');
    await user.clear(date);
    await user.type(date, '2026-02-15');
    await user.click(screen.getByRole('button', { name: '2 hours' }));
    await fillStudents(user, ['A', 'B', 'C', 'D', 'E']);
    await waitFor(() =>
      expect(screen.getByTestId('price-amount')).toHaveTextContent('$0'),
    );
    expect(state.seasonGets).toContain('2025/26');
    expect(screen.getByText('Season pass is active')).toBeInTheDocument();
    expect(screen.queryByTestId('price-breakdown')).not.toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Register for free');
    expect(screen.getByTestId('cap-total')).toHaveTextContent(
      'Season total $0 / $400',
    );
    await user.click(submitButton());
    expect(
      await screen.findByText('Registered INS-20261015-0001 · free'),
    ).toBeInTheDocument();
    expect(state.posts[0]).toMatchObject({ lessonDate: '2026-02-15' });
    expect(state.posts[0]).not.toHaveProperty('topUp');
  });

  it('disables submit with a hint naming the nearest season when no season covers the date', async () => {
    serve(myInsurance());
    const user = await renderPage();
    await fillStudents(user, ['Wei Zhang']);
    const date = screen.getByLabelText('Lesson date');
    await user.clear(date);
    await user.type(date, '2026-07-01');
    expect(screen.getByTestId('date-hint')).toHaveTextContent(
      "This date isn't in any insurance season (2025/26: Nov 1, 2025 – Apr 30, 2026)",
    );
    expect(date).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('price-amount')).toHaveTextContent('—');
    expect(submitButton()).toHaveTextContent(/^Register$/);
    expect(submitButton()).toBeDisabled();
    await user.click(submitButton());
    await user.type(nameInput(1), '{Enter}');
    expect(state.posts).toHaveLength(0);
    expect(
      screen.queryByText("Please confirm every student's waiver is signed"),
    ).not.toBeInTheDocument();

    await user.clear(date);
    await user.type(date, '2026-09-20');
    expect(screen.getByTestId('date-hint')).toHaveTextContent(
      '(2026/27: Nov 1, 2026 – Apr 30, 2027)',
    );
    await user.clear(date);
    await user.type(date, '2026-11-01');
    expect(screen.queryByTestId('date-hint')).not.toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Register · $10 due');
    expect(submitButton()).toBeEnabled();
  });

  it('shows the outside-season hint in Chinese', async () => {
    serve(myInsurance());
    const user = await renderPage('zh-CN');
    const date = screen.getByLabelText('上课日期');
    await user.clear(date);
    await user.type(date, '2026-07-01');
    expect(screen.getByTestId('date-hint')).toHaveTextContent(
      /^该日期不在任何保险季内（2025\/26：2025年11月1日 – 2026年4月30日）$/,
    );
    expect(screen.getByRole('button', { name: /^登记$/ })).toBeDisabled();
  });

  it("leaves the date empty and shows the current season's range when today is outside every season", async () => {
    vi.setSystemTime(new Date('2026-10-16T15:00:00Z'));
    serve(myInsurance());
    const user = await renderPage();
    const date = screen.getByLabelText('Lesson date');
    expect(date).toHaveValue('');
    expect(screen.getByTestId('date-hint')).toHaveTextContent(
      'Choose the lesson date (insurance season 2026/27: Nov 1, 2026 – Apr 30, 2027)',
    );
    expect(date).toHaveAttribute('aria-invalid', 'false');
    await fillStudents(user, ['Wei Zhang']);
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent(/^Register$/);
    await user.type(date, '2026-11-05');
    expect(screen.queryByTestId('date-hint')).not.toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Register · $10 due');
    await user.click(submitButton());
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0]).toMatchObject({ lessonDate: '2026-11-05' });
  });

  it('shows the progress bar, the remaining amount and the unpaid line', async () => {
    serve(withHistory);
    await renderPage();
    expect(screen.getByTestId('cap-total')).toHaveTextContent(
      'Season total $50 / $400',
    );
    const bar = screen.getByRole('progressbar', {
      name: 'Season cap progress',
    });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemax', '400');
    expect((bar.firstChild as HTMLElement).style.width).toBe('12.5%');
    expect(
      screen.getByText(
        '$350 to go until the season cap. After that, lessons are free to register.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('$10 of it is unpaid')).toBeInTheDocument();
  });

  it('shows the at-cap text with a full bar and no unpaid line', async () => {
    serve(
      myInsurance({ owedCents: 40000, paidCents: 40000, coverage: 'capped' }),
    );
    await renderPage();
    const bar = screen.getByRole('progressbar');
    expect((bar.firstChild as HTMLElement).style.width).toBe('100%');
    expect(
      screen.getByText(
        'Your insurance is capped for this season. Later registrations are free.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/of it is unpaid/)).not.toBeInTheDocument();
  });
});

describe('InsurancePage retries', () => {
  it('reuses the idempotency key after a failed submit and rotates it after success', async () => {
    serve(myInsurance());
    const user = await renderPage();
    await fillStudents(user, ['Wei Zhang']);
    failNextRegistration();
    await user.click(submitButton());
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(nameInput(1)).toHaveValue('Wei Zhang');
    await user.click(submitButton());
    await screen.findByText('Registered INS-20261015-0001 · $10 due');
    await fillStudents(user, ['Amy Li']);
    await user.click(submitButton());
    await screen.findByText('Registered INS-20261015-0002 · $10 due');
    const keys = state.posts.map((p) => p.idempotencyKey);
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('keeps the same key when a lesson that crosses the cap fails and is retried', async () => {
    serve(myInsurance({ owedCents: 38000, paidCents: 38000 }));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: '2 hours' }));
    await fillStudents(user, ['Wei Zhang', 'Amy Li']);
    failNextRegistration();
    await user.click(submitButton());
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Register · $20 due');
    await user.click(submitButton());
    await screen.findByText('Registered INS-20261015-0001 · $20 due');
    const keys = state.posts.map((p) => p.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});

describe('InsurancePage records and states', () => {
  it('lists records in API order with status labels', async () => {
    serve(withHistory);
    await renderPage();
    const table = screen.getByRole('table', { name: 'My registrations' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Lesson date',
      'Students',
      'Duration',
      'Amount',
      'Record no.',
      'Status',
      'Created',
    ]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((r) => within(r).getAllByRole('cell')[4]!.textContent),
    ).toEqual(['INS-20261219-0002', 'INS-20261212-0001', 'INS-20261205-0001']);
    expect(rows[0]).toHaveTextContent('Dec 19, 2026Leo Chen1 hour$10');
    expect(rows[0]).toHaveTextContent('Unpaid');
    expect(rows[1]).toHaveTextContent('Wei Zhang, Amy Li2 hours$40');
    expect(rows[1]).toHaveTextContent('Paid');
    expect(rows[2]).toHaveTextContent('Voided');
    const cards = within(
      screen.getByRole('list', { name: 'My registrations' }),
    ).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('Dec 19, 2026 · 1 hour$10');
    expect(cards[0]).toHaveTextContent('INS-20261219-0002');
  });

  it('shows the empty state and focuses the form from its button', async () => {
    serve(myInsurance());
    const user = await renderPage();
    expect(screen.getByText('No registrations yet')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Register your first lesson' }),
    );
    expect(nameInput(1)).toHaveFocus();
  });

  it('locks the tab with no form while pending', async () => {
    serve(myInsurance({ locked: true, lockReason: 'pending_approval' }));
    await renderPage();
    expect(
      screen.getByText('Your profile is being reviewed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Once you are approved you can register private lessons for insurance.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Register( ·| for free|$)/ }),
    ).toBeNull();
    expect(screen.queryByText('My registrations')).not.toBeInTheDocument();
  });

  it('locks the tab with no form when rejected', async () => {
    serve(myInsurance({ locked: true, lockReason: 'rejected' }));
    await renderPage('zh-CN');
    expect(screen.getByText('你的资料未通过审核')).toBeInTheDocument();
    expect(
      screen.getByText('你无法登记私课保险。如有疑问，请联系 SSnow。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /登记/ })).toBeNull();
  });

  it('locks the tab with no form when deactivated', async () => {
    serve(myInsurance({ locked: true, lockReason: 'deactivated' }));
    await renderPage();
    const banner = screen
      .getByText('Your profile is deactivated')
      .closest('[role="status"]');
    expect(banner).toHaveTextContent(
      "You can't register private lessons for insurance while deactivated. Contact SSnow if you have questions.",
    );
    expect(
      screen.getByText(
        'Only approved, active instructors can register private lessons for insurance.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Lesson date')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Register( ·| for free|$)/ }),
    ).toBeNull();
  });

  it('says the tab is deactivated in Chinese', async () => {
    serve(myInsurance({ locked: true, lockReason: 'deactivated' }));
    await renderPage('zh-CN');
    expect(screen.getByRole('status')).toHaveTextContent(
      '你的资料已下线下线期间无法登记私课保险。如有疑问，请联系 SSnow。',
    );
    expect(screen.queryByLabelText('上课日期')).toBeNull();
  });

  it('sends an instructor with unfinished onboarding to the checklist', async () => {
    serve(myInsurance({ locked: true, lockReason: 'onboarding_incomplete' }));
    await renderPage();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Finish onboarding to register private lessons' +
        'Insurance registration opens once every required document and certification on your onboarding checklist is done.',
    );
    expect(
      screen.getByRole('link', { name: 'Go to onboarding' }),
    ).toHaveAttribute('href', '/onboarding');
    expect(screen.queryByLabelText('Lesson date')).toBeNull();
  });

  it('asks to finish onboarding in Chinese', async () => {
    serve(myInsurance({ locked: true, lockReason: 'onboarding_incomplete' }));
    await renderPage('zh-CN');
    expect(screen.getByRole('status')).toHaveTextContent(
      '完成入职资料后即可登记私课保险' +
        '入职清单上所有必填的文件和证书都完成后，即可登记私课保险。',
    );
    expect(screen.getByRole('link', { name: '前往入职资料' })).toHaveAttribute(
      'href',
      '/onboarding',
    );
  });

  it('shows a load error with retry', async () => {
    server.use(
      http.get('http://localhost:3000/me/insurance', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<InsurancePage />);
    expect(
      await screen.findByText("Couldn't load your lesson insurance."),
    ).toBeInTheDocument();
    serve(myInsurance());
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Register a lesson' }),
    ).toBeInTheDocument();
  });
});

describe('InsurancePage in Chinese', () => {
  it('uses the exact Chinese copy for the key labels', async () => {
    serve(withHistory);
    const user = await renderPage('zh-CN');
    expect(
      screen.getByText(
        '私课上课前，请先登记课程并支付保险。保险 $10/小时/学生，同一雪季累计 $400 封顶。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '请在上课前完成登记；未登记的课程不在保险覆盖范围内。每位学生每雪季只需签一次 waiver。整季保险用户每次课前仍需登记学生名单（免费）。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '保险费通过电子转账线下支付，管理员确认收款后状态会更新为已支付。',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('保险季')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '登记一节课' }),
    ).toBeInTheDocument();
    expect(screen.getByText('学生名单')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '＋ 添加学生' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Waiver 已签')).toBeInTheDocument();
    expect(
      screen.getByText('请确认每位学生的 waiver 已签署'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('price-breakdown')).toHaveTextContent(
      '$10 × 1 小时 × 1 人',
    );
    expect(
      screen.getByRole('button', { name: '登记 · 应付 $10' }),
    ).toBeDisabled();
    expect(screen.getByText('本季封顶进度')).toBeInTheDocument();
    expect(screen.getByTestId('cap-total')).toHaveTextContent(
      '本季累计 $50 / $400',
    );
    expect(screen.getByText('其中待付款 $10')).toBeInTheDocument();
    expect(screen.queryByText('整季私课保险')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /购买整季保险/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('我的登记记录')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: '我的登记记录' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      '上课日期',
      '学生姓名',
      '时长',
      '金额',
      '记录编号',
      '状态',
      '创建时间',
    ]);
    expect(within(table).getByText('待付款')).toBeInTheDocument();
    expect(within(table).getByText('已支付')).toBeInTheDocument();
    expect(within(table).getByText('已作废')).toBeInTheDocument();
    expect(within(table).getByText('Wei Zhang、Amy Li')).toBeInTheDocument();

    for (let i = 0; i < 4; i++)
      await user.click(screen.getByRole('button', { name: '＋ 添加学生' }));
    expect(screen.getByText('超过 4 人按 4 人计')).toBeInTheDocument();
  });

  it('charges the remainder past the cap and then registers free in Chinese', async () => {
    serve(myInsurance({ owedCents: 39000 }));
    const user = await renderPage('zh-CN');
    await user.click(screen.getByRole('button', { name: '2 小时' }));
    await user.type(
      screen.getByRole('textbox', { name: '学生 1 姓名' }),
      '张伟',
    );
    await user.click(
      screen.getByRole('checkbox', { name: '学生 1 Waiver 已签' }),
    );
    expect(screen.getByTestId('cap-breakdown')).toHaveTextContent(
      '原价 $20 · 封顶后应付 $10',
    );
    await user.click(screen.getByRole('button', { name: '登记 · 应付 $10' }));
    expect(
      await screen.findByText('已登记 INS-20261015-0001 · 应付 $10'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      await screen.findByText('本季保险已封顶，后续登记免费'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '免费登记' }),
    ).toBeInTheDocument();
    expect(screen.getByText('本季已封顶')).toBeInTheDocument();
    expect(screen.getByTestId('price-amount')).toHaveTextContent('$0');
  });

  it('shows the season pass as active in Chinese', async () => {
    serve(
      myInsurance({
        owedCents: 40000,
        unpaidCents: 40000,
        coverage: 'season_pass',
      }),
    );
    await renderPage('zh-CN');
    expect(screen.getByTestId('cap-status')).toHaveTextContent(
      '整季保险已生效',
    );
    expect(screen.getByTestId('cap-total')).toHaveTextContent(
      '本季累计 $400 / $400',
    );
    expect(screen.getByText('其中待付款 $400')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '免费登记' }),
    ).toBeInTheDocument();
  });

  it('shows the empty state in Chinese', async () => {
    serve(myInsurance({ records: [] }));
    await renderPage('zh-CN');
    expect(screen.getByText('还没有登记记录')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '登记第一节课' }),
    ).toBeInTheDocument();
  });

  it('shows a capped-free and a season-pass record', async () => {
    serve(
      myInsurance({
        owedCents: 40000,
        coverage: 'capped',
        records: [
          insuranceRecord({
            id: 'x',
            amountCents: 0,
            coverage: 'capped',
            paymentStatus: 'not_required',
          }),
        ],
      }),
    );
    await renderPage('zh-CN');
    expect(
      within(screen.getByRole('table')).getByText('已封顶免付'),
    ).toBeInTheDocument();
  });
});
