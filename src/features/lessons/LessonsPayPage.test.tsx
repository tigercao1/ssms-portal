import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/core/I18nProvider';
import { queryClient } from '@/lib/query';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { LessonsPayPage } from './LessonsPayPage';
import {
  emptyLessons,
  fakeMyLesson,
  fullLessons,
  onboardingLessons,
  pendingLessons,
  rejectedLessons,
} from './fixtures';
import type { MyLessonsResponse, MyPayPeriod } from './types';
import { expectMaskedInReplay } from '@/test/replayPrivacy';

const API = 'http://localhost:3000';

function serve(body: MyLessonsResponse) {
  server.use(http.get(`${API}/me/lessons`, () => HttpResponse.json(body)));
}

function renderPage(locale: 'en' | 'zh-CN' = 'en') {
  if (locale === 'zh-CN') localStorage.setItem('ssms.locale', 'zh-CN');
  return renderWithProviders(<LessonsPayPage />, { route: '/lessons' });
}

describe('LessonsPayPage upcoming lessons', () => {
  it('lists upcoming lessons with rate × time, pay and the projected total', async () => {
    serve(fullLessons);
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'My lessons & pay' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Estimated from your pay rates'),
    ).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Upcoming lessons' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      'Date',
      'Time',
      'Lesson',
      'Location',
      'Student(s)',
      'Rate × time',
      'Pay',
    ]);
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(
      'Sat, Feb 1310:00–12:001 to 1 private lessonMoonstoneWei Z.$90.00 × 2h$180.00',
    );
    expect(rows[2]).toHaveTextContent('Sun, Feb 14');
    expect(rows[2]).toHaveTextContent('Amy L.');
    expect(rows[3]).toHaveTextContent('Group lesson');
    expect(rows[3]).toHaveTextContent('3 students');
    expect(
      within(rows[3] as HTMLElement).getByText('Rate not set'),
    ).toBeVisible();
    expect(rows[3]).not.toHaveTextContent('$0.00');
    expect(rows[4]).toHaveTextContent(
      'Projected · 3 lessons(1 without a rate is not counted)$360.00',
    );
    expectMaskedInReplay(screen.getByTestId('upcoming-projected'));
  });

  it('shows the upcoming lessons as cards with a total bar on a phone', async () => {
    serve(fullLessons);
    renderPage();
    const cards = within(
      await screen.findByRole('list', { name: 'Upcoming lessons' }),
    ).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('Sat, Feb 13 · 10:00–12:00$180.00');
    expect(cards[0]).toHaveTextContent(
      '1 to 1 private lesson · Moonstone · Wei Z.',
    );
    expect(cards[0]).toHaveTextContent('$90.00 × 2h');
    expect(
      within(cards[2] as HTMLElement).getByText('Rate not set'),
    ).toBeVisible();
    const list = screen.getByRole('list', { name: 'Upcoming lessons' });
    expect(list.parentElement).toHaveClass('lg:hidden');
    expect(list.parentElement).toHaveTextContent(
      'Projected · 3 lessons$360.00',
    );
    expectMaskedInReplay(within(list.parentElement!).getByText('$360.00'));
    for (const card of cards) expectMaskedInReplay(card);
  });

  it('says when nothing is upcoming but past periods exist', async () => {
    serve({
      ...fullLessons,
      upcoming: { lessons: [], projected: [], needsRateCount: 0 },
    });
    renderPage();
    expect(
      await screen.findByText('No upcoming lessons booked.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Upcoming lessons' }),
    ).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Past lessons' }),
    ).toBeInTheDocument();
  });
});

describe('LessonsPayPage past lessons', () => {
  it('opens awaiting periods, keeps paid ones collapsed and toggles on click', async () => {
    serve(fullLessons);
    const user = userEvent.setup();
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Past lessons' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Grouped by pay period')).toBeInTheDocument();

    const awaiting = screen.getByRole('button', {
      name: 'Hide lessons for Jan 25 – Feb 7, 2027',
    });
    expect(awaiting).toHaveAttribute('aria-expanded', 'true');
    expect(awaiting).toHaveTextContent('Awaiting payroll');
    expect(awaiting).toHaveTextContent('2 lessons · 4h · 1 adjustment');
    expect(within(awaiting).getByTestId('period-total')).toHaveTextContent(
      '≈ $400.00',
    );
    const awaitingRows = within(
      screen.getByRole('list', { name: 'Jan 25 – Feb 7, 2027' }),
    ).getAllByRole('listitem');
    expect(awaitingRows).toHaveLength(3);
    expect(awaitingRows[0]).toHaveTextContent('Sat, Jan 30 · 10:00–12:00');
    expect(awaitingRows[2]).toHaveTextContent(
      'Adjustment · Travel to Blue Mountain+$40.00',
    );
    expect(awaitingRows[2]).toHaveClass('italic');

    const paid = screen.getByRole('button', {
      name: 'Show lessons for Jan 11 – Jan 24, 2027',
    });
    expect(paid).toHaveAttribute('aria-expanded', 'false');
    expect(paid).toHaveTextContent('Paid');
    expect(paid).toHaveTextContent('3 lessons · 6h');
    expect(within(paid).getByTestId('period-total')).toHaveTextContent(
      /^\$540\.00$/,
    );
    expect(
      screen.queryByRole('list', { name: 'Jan 11 – Jan 24, 2027' }),
    ).toBeNull();

    await user.click(paid);
    expect(paid).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(
        screen.getByRole('list', { name: 'Jan 11 – Jan 24, 2027' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(3);

    await user.click(awaiting);
    expect(awaiting).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('list', { name: 'Jan 25 – Feb 7, 2027' }),
    ).toBeNull();
  });

  it('shows a daily rate and a deduction in a paid period', async () => {
    serve(fullLessons);
    const user = userEvent.setup();
    renderPage();
    const daily = await screen.findByRole('button', {
      name: 'Show lessons for Dec 28, 2026 – Jan 10, 2027',
    });
    expect(daily).toHaveTextContent('1 lesson · 4h · 1 adjustment');
    await user.click(daily);
    const rows = within(
      screen.getByRole('list', { name: 'Dec 28, 2026 – Jan 10, 2027' }),
    ).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Group day');
    expect(rows[0]).toHaveTextContent('Blue Mountain');
    expect(
      within(rows[0] as HTMLElement).getByText('$400.00 × 1 day'),
    ).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('Group day · $400.00 × 1 day');
    expect(rows[1]).toHaveTextContent('Adjustment · Uniform-$65.00');
  });

  it('shows a stored zero payment in a paid period as No rate · $0.00', async () => {
    const paid = fullLessons.periods[1]!;
    const period = {
      ...paid,
      adjustments: [],
      lessons: [
        { ...paid.lessons[0]!, rate: null, amount: 0, needsRate: true },
      ],
    };
    const user = userEvent.setup();
    serve({ ...emptyLessons, periods: [period] });
    const { unmount } = renderPage();
    await user.click(
      await screen.findByRole('button', {
        name: 'Show lessons for Jan 11 – Jan 24, 2027',
      }),
    );
    const row = within(
      screen.getByRole('list', { name: 'Jan 11 – Jan 24, 2027' }),
    ).getAllByRole('listitem')[0] as HTMLElement;
    expect(within(row).getByText('No rate · $0.00')).toBeInTheDocument();
    expect(within(row).queryByText('Rate not set')).toBeNull();
    unmount();

    serve({ ...emptyLessons, periods: [period] });
    renderPage('zh-CN');
    await user.click(
      await screen.findByRole('button', {
        name: '显示 2027年1月11日 – 1月24日 的课程',
      }),
    );
    const zhRow = within(
      screen.getByRole('list', { name: '2027年1月11日 – 1月24日' }),
    ).getAllByRole('listitem')[0] as HTMLElement;
    expect(within(zhRow).getByText('无费率 · CA$0.00')).toBeInTheDocument();
    expect(within(zhRow).queryByText('费率待定')).toBeNull();
  });

  it('shows a stored zero-rate line without needsRate as No rate and $0.00', async () => {
    const [first] = fullLessons.periods;
    serve({
      ...emptyLessons,
      periods: [
        {
          ...first!,
          adjustments: [],
          lessons: [{ ...first!.lessons[0]!, rate: null, amount: 0 }],
        },
      ],
    });
    renderPage();
    const row = within(
      await screen.findByRole('list', { name: 'Jan 25 – Feb 7, 2027' }),
    ).getAllByRole('listitem')[0] as HTMLElement;
    expect(within(row).getByText('No rate')).toBeInTheDocument();
    expect(row).toHaveTextContent('1 to 1 private lesson · No rate');
    expect(row).toHaveTextContent('$0.00');
  });

  it('shows the pill and the exclusion note for an awaiting lesson without a rate', async () => {
    const [first] = fullLessons.periods;
    serve({
      ...emptyLessons,
      periods: [
        {
          ...first!,
          adjustments: [],
          lessons: [
            {
              ...first!.lessons[0]!,
              rate: null,
              amount: null,
              needsRate: true,
            },
          ],
          totals: [
            {
              ...first!.totals[0]!,
              lessons: 1,
              lessonAmount: 0,
              adjustmentAmount: 0,
              total: 0,
              needsRateCount: 1,
            },
          ],
        },
      ],
    });
    renderPage();
    const header = await screen.findByRole('button', {
      name: 'Hide lessons for Jan 25 – Feb 7, 2027',
    });
    expect(within(header).getByTestId('period-total')).toHaveTextContent(
      '≈ $0.00',
    );
    expect(within(header).getByTestId('period-not-counted')).toHaveTextContent(
      '(1 without a rate is not counted)',
    );
    const row = within(
      screen.getByRole('list', { name: 'Jan 25 – Feb 7, 2027' }),
    ).getAllByRole('listitem')[0] as HTMLElement;
    expect(within(row).getByText('Rate not set')).toBeInTheDocument();
    expect(row).not.toHaveTextContent('$0.00');
  });

  it('shows no exclusion note on paid or fully rated periods', async () => {
    serve(fullLessons);
    renderPage();
    await screen.findByRole('heading', { name: 'Past lessons' });
    expect(screen.queryByTestId('period-not-counted')).toBeNull();
  });
});

describe('LessonsPayPage states', () => {
  it('shows one empty card for an approved instructor with no lessons', async () => {
    serve(emptyLessons);
    renderPage();
    const heading = await screen.findByRole('heading', {
      name: 'No lessons booked yet',
    });
    expect(heading.parentElement?.querySelector('.bg-sunken')).toBeNull();
    expect(
      screen.getByText(/When the school books you on a lesson/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Upcoming lessons')).toBeNull();
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });

  it('shows the review banner and no data while pending', async () => {
    serve(pendingLessons);
    renderPage();
    expect(
      await screen.findByText('Your profile is being reviewed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Lessons and pay open once an admin approves you.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nothing to show yet. Only approved instructors can be booked.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Past lessons')).toBeNull();
  });

  it('asks an approved instructor to finish onboarding and links to it', async () => {
    serve(onboardingLessons);
    renderPage();
    const banner = (
      await screen.findByText('Finish onboarding to see your lessons and pay')
    ).closest('[role="status"]');
    expect(banner).toHaveTextContent(
      'Lessons and pay open once every required document on your onboarding checklist is done and your membership cards are approved.',
    );
    expect(
      screen.getByRole('link', { name: 'Go to onboarding' }),
    ).toHaveAttribute('href', '/onboarding');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Past lessons')).toBeNull();
    expect(screen.queryByText('Your profile is being reviewed')).toBeNull();
  });

  it('asks to finish onboarding in Chinese', async () => {
    serve(onboardingLessons);
    renderPage('zh-CN');
    expect(
      await screen.findByText('完成入职资料后即可查看课程和工资'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '入职清单上所有必填文件完成、且会员卡审核通过后，即可查看课程和工资。',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前往入职资料' })).toHaveAttribute(
      'href',
      '/onboarding',
    );
  });

  it('shows the not-approved banner and past lessons, without upcoming, when rejected', async () => {
    serve(rejectedLessons);
    renderPage();
    const banner = (
      await screen.findByText('Your profile was not approved')
    ).closest('[role="status"]');
    expect(banner).toHaveTextContent(
      "You can't be booked for new lessons. Your past lessons and pay are below.",
    );
    expect(
      screen.getByRole('heading', { name: 'Past lessons' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Hide lessons for Jan 25 – Feb 7, 2027',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Upcoming lessons')).toBeNull();
  });

  it('says so when a rejected instructor has no history', async () => {
    serve({ ...rejectedLessons, periods: [] });
    renderPage();
    expect(
      await screen.findByText('No past lessons or pay yet.'),
    ).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/me/lessons`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ message: 'boom' }, { status: 500 })
          : HttpResponse.json(emptyLessons);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    expect(
      await screen.findByText('Could not load your lessons and pay.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'No lessons booked yet' }),
    ).toBeInTheDocument();
  });
});

describe('LessonsPayPage in Chinese', () => {
  it('renders the full page in zh-CN', async () => {
    serve(fullLessons);
    renderPage('zh-CN');
    expect(
      await screen.findByRole('heading', { name: '我的课程与工资' }),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', { name: '即将上的课' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['日期', '时间', '课程', '地点', '学员', '费率 × 时长', '工资']);
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('2月13日 周六');
    expect(rows[1]).toHaveTextContent('1对1');
    expect(rows[1]).toHaveTextContent('CA$90.00/小时 × 2 小时');
    expect(within(rows[3] as HTMLElement).getByText('费率待定')).toBeVisible();
    expect(rows[3]).toHaveTextContent('3 名学员');
    expect(rows[4]).toHaveTextContent(
      '预计工资 · 3 节课（1 节课没有费率，未计入）CA$360.00',
    );
    expect(
      screen.getByRole('heading', { name: '已上的课' }),
    ).toBeInTheDocument();
    const awaiting = screen.getByRole('button', {
      name: '隐藏 2027年1月25日 – 2月7日 的课程',
    });
    expect(awaiting).toHaveTextContent('待结算');
    expect(awaiting).toHaveTextContent('2 节课 · 4 小时 · 1 项调整');
    expect(
      screen.getByText('调整 · Travel to Blue Mountain'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: '显示 2027年1月11日 – 1月24日 的课程',
      }),
    ).toHaveTextContent('已结算');
  });

  it('renders the empty, pending and rejected states in zh-CN', async () => {
    serve(emptyLessons);
    const { unmount } = renderPage('zh-CN');
    expect(
      await screen.findByRole('heading', { name: '暂无预约课程' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/学校为你安排课程后/)).toBeInTheDocument();
    unmount();

    serve(pendingLessons);
    const pending = renderPage('zh-CN');
    expect(await screen.findByText('你的资料正在审核中')).toBeInTheDocument();
    expect(
      screen.getByText('审核通过后即可查看课程和工资。'),
    ).toBeInTheDocument();
    pending.unmount();

    serve(rejectedLessons);
    renderPage('zh-CN');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '你的资料未通过审核你无法被安排新的课程。你过去的课程和工资见下方。',
      ),
    );
  });
});

describe('LessonsPayPage after a lesson is cancelled', () => {
  afterEach(() => {
    focusManager.setFocused(undefined);
  });

  const afterCancel: MyLessonsResponse = {
    ...fullLessons,
    upcoming: {
      ...fullLessons.upcoming,
      lessons: fullLessons.upcoming.lessons.filter((l) => l.classId !== 'c2'),
      projected: [{ currency: 'CAD', amount: 180, lessons: 1 }],
    },
  };

  function setup() {
    let body = fullLessons;
    server.use(http.get(`${API}/me/lessons`, () => HttpResponse.json(body)));
    const client = new QueryClient({
      defaultOptions: queryClient.getDefaultOptions(),
    });
    const open = () =>
      render(
        <QueryClientProvider client={client}>
          <I18nProvider>
            <MemoryRouter initialEntries={['/lessons']}>
              <LessonsPayPage />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>,
      );
    return {
      open,
      cancel: () => {
        body = afterCancel;
      },
    };
  }

  const projected = () =>
    screen
      .findByTestId('upcoming-projected')
      .then((cell) => cell.closest('tr'));

  it('shows the new projected total when the page is opened again', async () => {
    const { open, cancel } = setup();
    const view = open();
    expect(await projected()).toHaveTextContent('Projected · 3 lessons');
    view.unmount();

    cancel();
    open();

    await waitFor(async () =>
      expect(await projected()).toHaveTextContent(
        'Projected · 2 lessons(1 without a rate is not counted)$180.00',
      ),
    );
  });

  it('shows the new projected total when the tab regains focus', async () => {
    const { open, cancel } = setup();
    open();
    expect(await projected()).toHaveTextContent('Projected · 3 lessons');

    cancel();
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(async () =>
      expect(await projected()).toHaveTextContent(
        'Projected · 2 lessons(1 without a rate is not counted)$180.00',
      ),
    );
  });
});

describe('LessonsPayPage late payroll lines', () => {
  const current: MyPayPeriod = {
    startsOn: '2027-02-08',
    endsOn: '2027-02-21',
    status: 'awaiting',
    finalizedAt: null,
    lessons: [
      fakeMyLesson({ classId: 'n1', date: '2027-02-09', status: 'completed' }),
      fakeMyLesson({
        classId: 'l1',
        date: '2027-01-20',
        status: 'completed',
        late: true,
      }),
      fakeMyLesson({
        classId: 'x1',
        date: '2027-01-21',
        status: 'cancelled',
        amount: -180,
        lateCancel: true,
        reassigned: true,
      }),
      fakeMyLesson({
        classId: 'c1',
        date: '2027-01-22',
        status: 'completed',
        amount: -20,
        late: true,
        correction: true,
      }),
    ],
    adjustments: [],
    totals: [
      {
        currency: 'CAD',
        lessons: 1,
        minutes: 120,
        lessonAmount: 160,
        adjustmentAmount: 0,
        total: 160,
        needsRateCount: 0,
      },
    ],
  };

  function rows() {
    const list = screen.getByRole('list', { name: /Feb 8 – Feb 21, 2027/ });
    return within(list).getAllByRole('listitem');
  }

  it('labels late, late cancel, correction and reassigned lines', async () => {
    serve({ ...emptyLessons, periods: [current] });
    renderPage();
    await screen.findByRole('heading', { name: 'Past lessons' });

    const [normal, late, cancel, correction] = rows() as HTMLElement[];
    expect(within(normal!).queryByText('Late')).toBeNull();
    expect(late).toHaveTextContent('Wed, Jan 20');
    expect(within(late!).getByText('Late')).toBeVisible();
    expect(within(cancel!).getByText('Late cancel')).toBeVisible();
    expect(within(cancel!).getByText('Reassigned')).toBeVisible();
    expect(cancel).toHaveTextContent('-$180.00');
    expect(within(correction!).getByText('Correction')).toBeVisible();
    expect(correction).toHaveTextContent('—');
    expect(correction).not.toHaveTextContent('× 2h');
    expect(correction).toHaveTextContent('-$20.00');

    expect(screen.getByText('What the labels mean')).toBeVisible();
    expect(
      screen.getByText(
        'Cancelled after its pay period was finalized, so the pay is taken back in this period.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Adjusts an amount paid earlier. It is not counted as a lesson.',
      ),
    ).toBeVisible();
  });

  it('counts lessons and hours from the period totals', async () => {
    serve({ ...emptyLessons, periods: [current] });
    renderPage();
    const toggle = await screen.findByRole('button', {
      name: /lessons for Feb 8 – Feb 21, 2027/,
    });
    expect(toggle).toHaveTextContent('1 lesson · 2h');
    expect(within(toggle).getByTestId('period-total')).toHaveTextContent(
      '≈ $160.00',
    );
  });

  it('shows the labels in Chinese', async () => {
    serve({ ...emptyLessons, periods: [current] });
    renderPage('zh-CN');
    await screen.findByRole('heading', { name: '已上的课' });
    for (const label of ['补发', '取消扣回', '更正', '改派', '标签说明']) {
      expect(screen.getAllByText(label)[0]).toBeVisible();
    }
  });
});

describe('LessonsPayPage adjusted lines', () => {
  const current: MyPayPeriod = {
    startsOn: '2027-02-08',
    endsOn: '2027-02-21',
    status: 'awaiting',
    finalizedAt: null,
    lessons: [
      fakeMyLesson({
        classId: 'a1',
        date: '2027-01-20',
        status: 'completed',
        minutes: 30,
        amount: 45,
        adjusted: true,
        changes: ['length'],
      }),
      fakeMyLesson({
        classId: 'a2',
        date: '2027-01-21',
        status: 'completed',
        minutes: -30,
        amount: -45,
        adjusted: true,
        changes: ['length', 'lesson_type'],
      }),
    ],
    adjustments: [],
    totals: [
      {
        currency: 'CAD',
        lessons: 0,
        minutes: 0,
        lessonAmount: 0,
        adjustmentAmount: 0,
        total: 0,
        needsRateCount: 0,
      },
    ],
  };

  function rows() {
    const list = screen.getByRole('list', { name: /2027/ });
    return within(list).getAllByRole('listitem');
  }

  it('labels an adjusted line with its reason, minute change and signed amount', async () => {
    serve({ ...emptyLessons, periods: [current] });
    renderPage();
    await screen.findByRole('heading', { name: 'Past lessons' });

    const [longer, shorter] = rows() as HTMLElement[];
    expect(within(longer!).getByText('Adjusted')).toBeVisible();
    expect(within(longer!).getByText('Length changed')).toBeVisible();
    expect(within(longer!).getAllByText('+30 min')[0]).toBeInTheDocument();
    expect(longer).toHaveTextContent('+$45.00');
    expect(longer).not.toHaveTextContent('× ');

    expect(
      within(shorter!).getByText('Length changed, Lesson type changed'),
    ).toBeVisible();
    expect(within(shorter!).getAllByText('-30 min')[0]).toBeInTheDocument();
    expect(shorter).toHaveTextContent('-$45.00');

    expect(screen.getByText('What the labels mean')).toBeVisible();
    expect(
      screen.getByText(
        'The length or lesson type changed after the lesson was paid. The difference is paid or taken back in this period, with the change in minutes. It is not counted as another lesson.',
      ),
    ).toBeVisible();
  });

  it('shows the adjusted label in Chinese', async () => {
    serve({ ...emptyLessons, periods: [current] });
    renderPage('zh-CN');
    await screen.findByRole('heading', { name: '已上的课' });
    const [longer, shorter] = rows() as HTMLElement[];
    expect(within(longer!).getByText('已调整')).toBeVisible();
    expect(within(longer!).getAllByText('+30 分钟')[0]).toBeInTheDocument();
    expect(
      within(shorter!).getByText('时长已更改、课程类型已更改'),
    ).toBeVisible();
  });
});

describe('LessonsPayPage background refresh failure', () => {
  afterEach(() => {
    focusManager.setFocused(undefined);
  });

  it('keeps the loaded page with a notice and a retry when a refetch fails', async () => {
    let status = 200;
    server.use(
      http.get(`${API}/me/lessons`, () =>
        status === 200
          ? HttpResponse.json(fullLessons)
          : HttpResponse.json({ message: 'boom' }, { status }),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByTestId('upcoming-projected')).toBeVisible();

    status = 500;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(
      await screen.findByText(
        "Couldn't refresh. Showing what was loaded earlier.",
      ),
    ).toBeVisible();
    expect(screen.getByTestId('upcoming-projected')).toHaveTextContent(
      '$360.00',
    );
    expect(
      screen.queryByText('Could not load your lessons and pay.'),
    ).toBeNull();

    status = 200;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(
        screen.queryByText(
          "Couldn't refresh. Showing what was loaded earlier.",
        ),
      ).toBeNull(),
    );
  });

  it('shows the full error card and no notice when nothing has loaded', async () => {
    server.use(
      http.get(`${API}/me/lessons`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderPage();
    expect(
      await screen.findByText('Could not load your lessons and pay.'),
    ).toBeVisible();
    expect(
      screen.queryByText("Couldn't refresh. Showing what was loaded earlier."),
    ).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'My lessons & pay' }),
    ).toBeNull();
  });
});
