import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { InsurancePage } from './InsurancePage';
import {
  buildRequest,
  createInsuranceState,
  insuranceHandlers,
  insuranceRecord,
  LOCATIONS,
  myInsurance,
  onboardingInsurance,
  paidRequest,
  SEASON_2025,
  SEASON_2027,
  unpaidRequest,
  withRequests,
  type InsuranceMockState,
} from './fixtures';
import { DRAFT_KEY_PREFIX, MAX_LESSONS } from './draft';
import type { MyInsurance } from './types';

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({ user: { id: 'auth-1' } }),
}));

const API = 'http://localhost:3000';
const DRAFT_KEY = `${DRAFT_KEY_PREFIX}auth-1`;
let state: InsuranceMockState;

type User = ReturnType<typeof userEvent.setup>;

function serve(data: MyInsurance = withRequests) {
  state = createInsuranceState(data);
  server.use(
    ...insuranceHandlers(state),
    http.get(`${API}/reference/teaching-locations`, () =>
      HttpResponse.json(LOCATIONS),
    ),
  );
}

function setDesktop(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => setDesktop(false));
afterEach(() => vi.unstubAllGlobals());

function Where() {
  const { pathname, search } = useLocation();
  return (
    <>
      <span data-testid="path">{pathname}</span>
      <span data-testid="search">{search}</span>
    </>
  );
}

async function renderPage({
  route = '/insurance',
  locale = 'en',
}: { route?: string; locale?: 'en' | 'zh-CN' } = {}) {
  if (locale === 'zh-CN') localStorage.setItem('ssms.locale', 'zh-CN');
  const user = userEvent.setup();
  const page = <InsurancePage />;
  const view = renderWithProviders(
    <>
      <Routes>
        <Route path="/insurance" element={page} />
        <Route path="/insurance/new" element={page} />
        <Route path="/insurance/new/review" element={page} />
      </Routes>
      <Where />
    </>,
    { route },
  );
  await screen.findAllByRole('heading', { level: 1 });
  return { user, ...view };
}

const path = () => screen.getByTestId('path').textContent;
const search = () =>
  new URLSearchParams(screen.getByTestId('search').textContent ?? '');
const cards = () => screen.getAllByTestId('lesson');

interface LessonInput {
  date?: string;
  hours?: 1 | 2;
  area?: string;
  other?: string;
  students?: [string, boolean][];
}

async function addLesson(user: User, input: LessonInput, en = true) {
  await user.click(screen.getByTestId('add-lesson'));
  const n = cards().length;
  const card = cards()[n - 1]!;
  const c = within(card);
  if (input.date)
    fireEvent.change(c.getByLabelText(en ? 'Date' : '日期'), {
      target: { value: input.date },
    });
  if (input.hours === 2)
    await user.click(
      c.getByRole('button', { name: en ? '2 hours' : '2 小时' }),
    );
  if (input.area) {
    await c.findByRole('option', { name: 'Blue Mountain' });
    await user.selectOptions(
      c.getByLabelText(en ? 'Ski area (optional)' : '雪场（选填）'),
      input.area,
    );
  }
  if (input.other)
    await user.type(
      c.getByLabelText(en ? 'Other ski area' : '其他雪场名称'),
      input.other,
    );
  for (const [i, [name, tick]] of (input.students ?? []).entries()) {
    await user.click(
      c.getByRole('button', { name: en ? '+ Add student' : '＋ 添加学员' }),
    );
    if (name)
      await user.type(
        c.getByRole('textbox', {
          name: en
            ? `Lesson ${n} student ${i + 1} name`
            : `第 ${n} 节第 ${i + 1} 名学员姓名`,
        }),
        name,
      );
    if (tick) await user.click(waiverBox(n, i + 1, en));
  }
  return card;
}

function waiverBox(lesson: number, student: number, en = true) {
  return screen.getByRole('checkbox', {
    name: en
      ? `Lesson ${lesson} student ${student} signed the club waiver`
      : `第 ${lesson} 节第 ${student} 名学员已签俱乐部 waiver`,
  });
}

const LESSON_1: LessonInput = {
  date: '2026-12-26',
  hours: 2,
  area: 'Blue Mountain',
  students: [
    ['Anna', true],
    ['Ben', true],
  ],
};

const LESSON_2: LessonInput = {
  date: '2026-12-27',
  area: 'Other',
  other: 'Glen Eden',
  students: [
    ['Chris', true],
    ['Leo', false],
    ['Mia', true],
    ['Noah', true],
    ['Olivia', true],
  ],
};

describe('InsurancePage list', () => {
  it('lands on the requests with the header, progress and payment note', async () => {
    serve();
    await renderPage({ locale: 'zh-CN' });
    expect(
      screen.getByRole('heading', { level: 1, name: /私课投保/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '教练自行售出的私人课程，学员签署俱乐部 waiver 后，可按 $10/小时/学员 的标准投保。保险费每雪季 $400 封顶，达到上限后不再收取。',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('season-select')).toHaveValue('2026/27'),
    );
    expect(screen.getByTestId('cap-total')).toHaveTextContent(
      '本季累计 $350 / $400',
    );
    expect(screen.getByTestId('cap-status')).toHaveTextContent(
      '再投保 $50 即封顶，之后免费',
    );
    expect(screen.getByText('共 2 条')).toBeInTheDocument();
    expect(
      screen.getByText(
        '保险费通过电子转账线下支付，管理员确认收款后状态会更新为已支付。',
      ),
    ).toBeInTheDocument();
    const entries = screen.getAllByTestId('entry');
    expect(
      entries.map((e) => within(e).getByTestId('entry-no').textContent),
    ).toEqual(['INS-20261014-0011', 'INS-20261006-0004']);
    expect(within(entries[0]!).getByTestId('entry-total')).toHaveTextContent(
      '$190',
    );
    expect(within(entries[0]!).getByTestId('request-status')).toHaveTextContent(
      '待付款',
    );
    expect(within(entries[1]!).getByTestId('request-status')).toHaveTextContent(
      '已支付',
    );
    expect(
      within(entries[0]!).getByText(/3 节课 · 11 名学员/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('new-request')).toHaveTextContent('新建投保');
  });

  it('expands an entry into its lessons and students', async () => {
    serve();
    const { user } = await renderPage();
    const entry = screen.getAllByTestId('entry')[1]!;
    const toggle = within(entry).getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const lessons = within(entry).getAllByTestId('tree-lesson');
    expect(lessons).toHaveLength(2);
    expect(lessons[1]).toHaveTextContent('Lesson 2');
    expect(lessons[1]).toHaveTextContent('2 hours');
    expect(lessons[1]).toHaveTextContent(
      'Mount St. Louis Moonstone · 5 students',
    );
    expect(within(lessons[1]!).getAllByTestId('tree-student')).toHaveLength(5);
    expect(within(lessons[1]!).getByText('Lucas He')).toBeInTheDocument();
    await user.click(toggle);
    expect(within(entry).queryByTestId('tree-lesson')).not.toBeInTheDocument();
  });

  it('shows the empty state and opens a new request from it', async () => {
    serve(myInsurance());
    const { user } = await renderPage();
    expect(screen.getByText('No insurance requests yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'One request can cover several lessons. Once submitted, it shows up here as one entry.',
      ),
    ).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', {
      name: 'New insurance request',
    });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]!);
    expect(path()).toBe('/insurance/new');
    expect(screen.getByTestId('draft-empty')).toHaveTextContent(
      'This draft is empty. Add a lesson to start.',
    );
    expect(
      screen.getByRole('button', { name: 'Review & submit' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Add at least one lesson to submit'),
    ).toBeInTheDocument();
  });

  it('labels each request status and strikes through voided totals', async () => {
    const base = { createdAt: '2026-10-01T15:00:00Z' };
    const lesson = {
      lessonDate: '2026-12-01',
      durationHours: 1,
      students: [{ name: 'A', waiverConfirmed: true }],
    };
    serve(
      myInsurance({
        owedCents: 40000,
        coverage: 'capped',
        requests: [
          buildRequest(
            { ...base, id: 'a', requestNo: 'INS-A', paymentStatus: 'paid' },
            [lesson],
          ),
          buildRequest({ ...base, id: 'b', requestNo: 'INS-B' }, [lesson]),
          buildRequest(
            { ...base, id: 'c', requestNo: 'INS-C', owedCents: 40000 },
            [lesson],
          ),
          buildRequest(
            { ...base, id: 'd', requestNo: 'INS-D', paymentStatus: 'voided' },
            [lesson],
          ),
          buildRequest(
            { ...base, id: 'e', requestNo: 'INS-E', seasonPass: true },
            [lesson],
          ),
        ],
        records: [
          insuranceRecord({
            id: 'pass',
            recordNo: 'INS-PASS',
            kind: 'season_pass',
            lessonDate: null,
            durationHours: null,
            students: [],
            coverage: null,
            createdAt: '2026-09-01T00:00:00Z',
          }),
        ],
      }),
    );
    await renderPage();
    const byNo = (no: string) =>
      screen
        .getAllByTestId('entry')
        .find((e) => within(e).getByTestId('entry-no').textContent === no)!;
    expect(
      within(byNo('INS-A')).getByTestId('request-status'),
    ).toHaveTextContent('Paid');
    expect(
      within(byNo('INS-B')).getByTestId('request-status'),
    ).toHaveTextContent('Unpaid');
    expect(
      within(byNo('INS-C')).getByTestId('request-status'),
    ).toHaveTextContent('Free after cap');
    expect(within(byNo('INS-C')).getByTestId('entry-total')).toHaveTextContent(
      '$0',
    );
    expect(
      within(byNo('INS-D')).getByTestId('request-status'),
    ).toHaveTextContent('Voided');
    expect(within(byNo('INS-D')).getByTestId('entry-total')).toHaveClass(
      'line-through',
    );
    expect(
      within(byNo('INS-E')).getByTestId('request-status'),
    ).toHaveTextContent('Season pass');
    expect(within(byNo('INS-PASS')).getAllByText('Season pass')).toHaveLength(
      2,
    );
    expect(
      within(byNo('INS-PASS')).queryByRole('button'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('6 requests')).toBeInTheDocument();
    expect(screen.getByTestId('cap-status')).toHaveTextContent(
      'Season cap reached; further insurance is free',
    );
  });

  it('shows the locked state even on the new-request route', async () => {
    serve(myInsurance({ locked: true, lockReason: 'pending_approval' }));
    await renderPage({ route: '/insurance/new' });
    expect(
      screen.getByText('Your profile is being reviewed'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('add-lesson')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-request')).not.toBeInTheDocument();
  });

  it('asks an approved instructor to finish onboarding and links to it', async () => {
    serve(onboardingInsurance);
    await renderPage({ route: '/insurance/new' });
    const banner = screen
      .getByText('Finish onboarding to insure private lessons')
      .closest('[role="status"]');
    expect(banner).toHaveTextContent(
      'Lesson insurance opens once every required document and certification on your onboarding checklist is done.',
    );
    expect(
      screen.getByRole('link', { name: 'Go to onboarding' }),
    ).toHaveAttribute('href', '/onboarding');
    expect(screen.queryByTestId('add-lesson')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-request')).not.toBeInTheDocument();
    expect(screen.queryByText('Your profile is being reviewed')).toBeNull();
  });

  it('asks to finish onboarding in Chinese', async () => {
    serve(onboardingInsurance);
    await renderPage({ locale: 'zh-CN' });
    expect(
      screen.getByText('完成入职资料后即可为私课投保'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '入职清单上所有必填的文件和证书都完成后，即可为私课投保。',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前往入职资料' })).toHaveAttribute(
      'href',
      '/onboarding',
    );
  });

  it('hides new requests when no season is open', async () => {
    serve(myInsurance({ season: null }));
    await renderPage({ route: '/insurance/new' });
    expect(
      screen.getByText(
        "No insurance season is open right now, so you can't insure lessons yet.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('new-request')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-lesson')).not.toBeInTheDocument();
  });

  it('shows a retry when the overview fails to load', async () => {
    server.use(
      http.get(`${API}/me/insurance`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<InsurancePage />, { route: '/insurance' });
    expect(
      await screen.findByText("Couldn't load your lesson insurance."),
    ).toBeInTheDocument();
    serve();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('new-request')).toBeInTheDocument();
  });
});

describe('InsurancePage on phones', () => {
  it('builds two lessons, is blocked on the unticked waiver, then submits one $50 request', async () => {
    serve();
    const { user } = await renderPage();
    await user.click(screen.getByTestId('new-request'));
    expect(path()).toBe('/insurance/new');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /New insurance request/ }),
    ).toBeInTheDocument();

    await addLesson(user, LESSON_1);
    expect(within(cards()[0]!).getByTestId('lesson-price')).toHaveTextContent(
      '$40',
    );
    await addLesson(user, LESSON_2);
    expect(within(cards()[0]!).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(cards()[1]!).getByTestId('lesson-price')).toHaveTextContent(
      'List $40 · $10 after cap',
    );
    expect(
      within(cards()[1]!).getByText(
        '$10 × 1 hour × 4 students (5 enrolled, max 4 charged)',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('draft-preview')).toHaveTextContent(
      'This request +$50 → $400',
    );
    expect(
      screen.getByText(
        'Submitting this reaches the cap; later requests are free',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dock-summary')).toHaveTextContent(
      '2 lessons · $50 due',
    );

    await user.click(screen.getByRole('button', { name: 'Review & submit' }));
    const alert = screen.getByTestId('error-box');
    expect(alert).toHaveTextContent("Can't submit yet. Fix these first:");
    expect(
      within(alert).getByRole('button', {
        name: "Lesson 2: Leo hasn't confirmed the waiver",
      }),
    ).toBeInTheDocument();
    expect(cards()[1]).toHaveAttribute('aria-invalid', 'true');
    expect(cards()[0]).toHaveAttribute('aria-invalid', 'false');
    expect(within(cards()[1]!).getByTestId('student-error')).toHaveTextContent(
      "Lesson 2: Leo hasn't confirmed the waiver",
    );
    await waitFor(() => expect(waiverBox(2, 2)).toHaveFocus());
    expect(path()).toBe('/insurance/new');
    expect(state.posts).toHaveLength(0);

    await user.click(waiverBox(2, 2));
    expect(screen.queryByTestId('error-box')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review & submit' }));
    expect(path()).toBe('/insurance/new/review');
    expect(
      screen.getByRole('heading', { level: 1, name: /Review/ }),
    ).toBeInTheDocument();
    const tree = screen.getByTestId('review-tree');
    expect(
      within(tree)
        .getAllByTestId('lesson-price')
        .map((p) => p.textContent),
    ).toEqual(['$40', 'List $40 · $10 after cap']);
    expect(
      within(tree).getByText('Blue Mountain · $10 × 2 hours × 2 students'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('review-total')).toHaveTextContent('$50');

    await user.click(screen.getByRole('button', { name: 'Submit · $50 due' }));
    await waitFor(() => expect(path()).toBe('/insurance'));
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0]).toEqual({
      idempotencyKey: expect.any(String),
      lessons: [
        {
          lessonDate: '2026-12-26',
          durationHours: 2,
          locationId: 'l2',
          students: [
            { name: 'Anna', waiverConfirmed: true },
            { name: 'Ben', waiverConfirmed: true },
          ],
        },
        {
          lessonDate: '2026-12-27',
          durationHours: 1,
          locationOther: 'Glen Eden',
          students: ['Chris', 'Leo', 'Mia', 'Noah', 'Olivia'].map((name) => ({
            name,
            waiverConfirmed: true,
          })),
        },
      ],
    });
    const entries = await screen.findAllByTestId('entry');
    expect(entries).toHaveLength(3);
    const first = entries[0]!;
    expect(within(first).getByTestId('entry-no')).toHaveTextContent(
      'INS-20261018-0012',
    );
    expect(within(first).getByTestId('entry-total')).toHaveTextContent('$50');
    expect(within(first).getByTestId('request-status')).toHaveTextContent(
      'Unpaid',
    );
    expect(within(first).getByText('New')).toBeInTheDocument();
    expect(within(first).getAllByTestId('tree-lesson')).toHaveLength(2);
    expect(within(first).getAllByTestId('tree-student')).toHaveLength(7);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Submitted INS-20261018-0012',
    );
    expect(screen.getByRole('status')).toHaveClass('top-4');
    expect(screen.getByTestId('cap-status')).toHaveTextContent(
      'Season cap reached; further insurance is free',
    );
    expect(screen.getByTestId('new-request')).toHaveTextContent(
      'New insurance request',
    );
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('keeps the draft when going back and offers to continue it', async () => {
    serve();
    const { user } = await renderPage({ locale: 'zh-CN' });
    await user.click(screen.getByTestId('new-request'));
    await addLesson(
      user,
      { date: '2026-12-26', students: [['Anna', true]] },
      false,
    );
    await user.click(screen.getByRole('button', { name: '← 返回投保记录' }));
    expect(path()).toBe('/insurance');
    expect(screen.getByTestId('new-request')).toHaveTextContent('继续草稿');
    expect(screen.getByTestId('draft-banner')).toHaveTextContent(
      '你有一份未提交的草稿（1 节课）。',
    );
    expect(screen.getByTestId('draft-preview')).toHaveTextContent(
      '本次投保 +$10 → 累计 $360',
    );
    await user.click(screen.getByRole('button', { name: '继续编辑' }));
    expect(path()).toBe('/insurance/new');
    expect(
      screen.getByRole('textbox', { name: '第 1 节第 1 名学员姓名' }),
    ).toHaveValue('Anna');
  });

  it('restores the draft after a reload', async () => {
    serve();
    const first = await renderPage();
    await first.user.click(screen.getByTestId('new-request'));
    await addLesson(first.user, {
      date: '2026-12-26',
      students: [['Anna', false]],
    });
    expect(screen.getByText(/^✓ Draft saved \d\d:\d\d/)).toHaveTextContent(
      '(kept in this browser)',
    );
    first.unmount();
    await renderPage({ route: '/insurance/new' });
    expect(cards()).toHaveLength(1);
    expect(
      screen.getByRole('textbox', { name: 'Lesson 1 student 1 name' }),
    ).toHaveValue('Anna');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-12-26');
  });

  it('discards the draft from the list banner after confirming', async () => {
    serve();
    const { user } = await renderPage();
    await user.click(screen.getByTestId('new-request'));
    await addLesson(user, { date: '2026-12-26' });
    await user.click(
      screen.getByRole('button', { name: '← Back to requests' }),
    );
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    const dialog = screen.getByRole('dialog', { name: 'Discard this draft?' });
    expect(dialog).toHaveTextContent("The 1 lesson you added won't be kept.");
    await user.click(
      within(dialog).getByRole('button', { name: 'Keep editing' }),
    );
    expect(screen.getByTestId('draft-banner')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Discard draft',
      }),
    );
    expect(screen.queryByTestId('draft-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('new-request')).toHaveTextContent(
      'New insurance request',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Draft discarded');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('hides the sticky bar while a text field has focus', async () => {
    serve();
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, { date: '2026-12-26' });
    await user.click(screen.getByRole('button', { name: '+ Add student' }));
    expect(
      screen.getByRole('textbox', { name: 'Lesson 1 student 1 name' }),
    ).toHaveFocus();
    expect(screen.getByTestId('dock')).toHaveClass('hidden');
    await user.click(waiverBox(1, 1));
    await waitFor(() =>
      expect(screen.getByTestId('dock')).not.toHaveClass('hidden'),
    );
  });

  it('sends the review route back to the form when the draft is not ready', async () => {
    serve();
    await renderPage({ route: '/insurance/new/review' });
    expect(path()).toBe('/insurance/new');
  });
});

describe('InsurancePage on desktop', () => {
  beforeEach(() => setDesktop(true));

  it('builds the request in a drawer over the list and submits from its review screen', async () => {
    serve();
    const { user } = await renderPage({ locale: 'zh-CN' });
    await user.click(screen.getByTestId('new-request'));
    const dialog = screen.getByRole('dialog', { name: /新建投保/ });
    expect(
      screen.getByRole('heading', { level: 1, name: /私课投保/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('entry')).toHaveLength(2);
    await addLesson(user, LESSON_1, false);
    await addLesson(
      user,
      { ...LESSON_2, area: '其他', students: LESSON_2.students },
      false,
    );
    await user.click(
      within(dialog).getByRole('button', { name: '核对并提交' }),
    );
    expect(within(dialog).getByTestId('error-box')).toHaveTextContent(
      '第 2 节：学员 Leo 未确认 waiver',
    );
    await waitFor(() => expect(waiverBox(2, 2, false)).toHaveFocus());
    await user.click(waiverBox(2, 2, false));
    await user.click(
      within(dialog).getByRole('button', { name: '核对并提交' }),
    );
    const review = screen.getByRole('dialog', { name: /核对投保/ });
    expect(
      within(review)
        .getAllByTestId('lesson-price')
        .map((p) => p.textContent),
    ).toEqual(['$40', '原价 $40 · 封顶后应付 $10']);
    expect(within(review).getByTestId('review-total')).toHaveTextContent('$50');
    await user.click(
      within(review).getByRole('button', { name: '← 返回修改' }),
    );
    expect(
      screen.getByRole('dialog', { name: /新建投保/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '核对并提交' }));
    await user.click(
      screen.getByRole('button', { name: '提交投保 · 应付 $50' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const first = screen.getAllByTestId('entry')[0]!;
    expect(within(first).getByTestId('entry-total')).toHaveTextContent('$50');
    expect(within(first).getByTestId('request-status')).toHaveTextContent(
      '待付款',
    );
    expect(within(first).getAllByTestId('lesson-price')[1]).toHaveTextContent(
      '原价 $40 · 封顶后应付 $10',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '已提交 INS-20261018-0012',
    );
  });

  it('asks before discarding a non-empty draft when the drawer closes', async () => {
    serve();
    const { user } = await renderPage();
    await user.click(screen.getByTestId('new-request'));
    await addLesson(user, { date: '2026-12-26' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    const confirm = screen.getByRole('dialog', { name: 'Discard this draft?' });
    await user.click(
      within(confirm).getByRole('button', { name: 'Keep editing' }),
    );
    expect(
      screen.getByRole('dialog', { name: /New insurance request/ }),
    ).toBeInTheDocument();
    expect(cards()).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(
      screen.getByRole('dialog', { name: 'Discard this draft?' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(path()).toBe('/insurance');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Draft discarded');
  });

  it('closes an empty drawer without asking', async () => {
    serve();
    const { user } = await renderPage();
    await user.click(screen.getByTestId('new-request'));
    await user.click(screen.getByTestId('drawer-scrim'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(path()).toBe('/insurance');
  });

  it('reopens the drawer with the draft after a reload', async () => {
    serve();
    const first = await renderPage();
    await first.user.click(screen.getByTestId('new-request'));
    await addLesson(first.user, { date: '2026-12-26' });
    first.unmount();
    await renderPage({ route: '/insurance/new' });
    expect(
      screen.getByRole('dialog', { name: /New insurance request/ }),
    ).toBeInTheDocument();
    expect(cards()).toHaveLength(1);
  });
});

describe('InsurancePage draft editing', () => {
  it('prices lessons in order across the cap, then free', async () => {
    serve();
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, {
      date: '2026-12-26',
      hours: 2,
      students: [
        ['A', true],
        ['B', true],
        ['C', true],
        ['D', true],
      ],
    });
    expect(within(cards()[0]!).getByTestId('lesson-price')).toHaveTextContent(
      'List $80 · $50 after cap',
    );
    await addLesson(user, { date: '2026-12-27', students: [['E', true]] });
    expect(within(cards()[1]!).getByTestId('lesson-price')).toHaveTextContent(
      'List $10 · free after cap',
    );
    expect(screen.getByTestId('dock-summary')).toHaveTextContent(
      '2 lessons · $50 due',
    );
  });

  it('prices every lesson as free with a season pass', async () => {
    serve(myInsurance({ coverage: 'season_pass', owedCents: 40000 }));
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, { date: '2026-12-26', students: [['A', true]] });
    expect(within(cards()[0]!).getByTestId('lesson-price')).toHaveTextContent(
      'Season pass · free',
    );
    expect(screen.getByTestId('cap-status')).toHaveTextContent(
      'Season pass is active; insurance is free this season',
    );
  });

  it('names every problem and jumps to it, reopening a collapsed lesson', async () => {
    serve();
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, { students: [['', true]] });
    await addLesson(user, { date: '2027-06-01' });
    await user.click(
      within(cards()[0]!).getByRole('button', { name: 'Collapse' }),
    );
    await user.click(screen.getByRole('button', { name: 'Review & submit' }));
    const alert = screen.getByTestId('error-box');
    expect(
      within(alert)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Lesson 1: no date',
      'Lesson 1: student 1 has no name',
      'Lesson 2: no insurance season covers this date',
      'Lesson 2: add at least one student',
    ]);
    await waitFor(() =>
      expect(screen.getAllByLabelText('Date')[0]).toHaveFocus(),
    );
    expect(
      within(cards()[0]!).getByRole('button', { name: 'Collapse' }),
    ).toBeInTheDocument();
    await user.click(
      within(cards()[0]!).getByRole('button', { name: 'Collapse' }),
    );
    expect(within(cards()[0]!).getByTestId('lesson-error')).toHaveTextContent(
      'Lesson 1: student 1 has no name',
    );
    await user.click(
      within(alert).getByRole('button', {
        name: 'Lesson 1: student 1 has no name',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Lesson 1 student 1 name' }),
      ).toHaveFocus(),
    );
    await user.click(
      within(alert).getByRole('button', {
        name: 'Lesson 2: add at least one student',
      }),
    );
    await waitFor(() =>
      expect(
        within(cards()[1]!).getByRole('button', { name: '+ Add student' }),
      ).toHaveFocus(),
    );
  });

  it('duplicates a lesson with the same students a day later', async () => {
    serve();
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, LESSON_1);
    await user.click(
      within(cards()[0]!).getByRole('button', { name: 'Duplicate' }),
    );
    expect(cards()).toHaveLength(2);
    expect(within(cards()[0]!).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(cards()[1]!).getByLabelText('Date')).toHaveValue(
      '2026-12-27',
    );
    expect(
      screen.getByRole('textbox', { name: 'Lesson 2 student 2 name' }),
    ).toHaveValue('Ben');
    expect(waiverBox(2, 2)).toBeChecked();
    expect(
      within(cards()[1]!).getByLabelText('Ski area (optional)'),
    ).toHaveValue('l2');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Duplicated as lesson 2 (same students, date +1 day)',
    );
  });

  it('removes students and lessons', async () => {
    serve();
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, {
      students: [
        ['A', true],
        ['B', true],
      ],
    });
    await user.click(
      screen.getByRole('button', { name: 'Remove lesson 1 student 1' }),
    );
    expect(
      screen.getByRole('textbox', { name: 'Lesson 1 student 1 name' }),
    ).toHaveValue('B');
    await user.click(
      within(cards()[0]!).getByRole('button', { name: 'Remove' }),
    );
    expect(screen.queryByTestId('lesson')).not.toBeInTheDocument();
    expect(screen.getByTestId('draft-empty')).toBeInTheDocument();
  });

  it(`stops at ${MAX_LESSONS} lessons`, async () => {
    serve();
    const { user } = await renderPage({ route: '/insurance/new' });
    for (let i = 0; i < MAX_LESSONS; i++)
      await user.click(screen.getByTestId('add-lesson'));
    expect(cards()).toHaveLength(MAX_LESSONS);
    expect(screen.getByTestId('add-lesson')).toBeDisabled();
    expect(
      screen.getByText('A request holds up to 10 lessons.'),
    ).toBeInTheDocument();
    expect(
      within(cards()[0]!).getByRole('button', { name: 'Duplicate' }),
    ).toBeDisabled();
  });

  it('copies each waiver link once per request with a toast', async () => {
    serve();
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, { students: [['A', true]] });
    await addLesson(user, { students: [['B', true]] });
    expect(
      screen.getAllByRole('button', { name: 'Copy the Chinese waiver link' }),
    ).toHaveLength(1);
    await user.click(
      screen.getByRole('button', { name: 'Copy the Chinese waiver link' }),
    );
    expect(await navigator.clipboard.readText()).toBe(
      'https://ssnow.club/pages/waiver',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Copied the Chinese waiver link: https://ssnow.club/pages/waiver',
    );
    await user.click(
      screen.getByRole('button', { name: 'Copy the English waiver link' }),
    );
    expect(await navigator.clipboard.readText()).toBe(
      'https://ssnow.club/en/pages/waiver',
    );
  });

  it('shows the server validation errors on the review screen', async () => {
    serve();
    server.use(
      http.post(
        `${API}/me/insurance/requests`,
        () =>
          HttpResponse.json(
            {
              code: 'waiver_unconfirmed',
              indexes: [{ lessonIndex: 0, studentIndex: 0 }],
            },
            { status: 400 },
          ),
        { once: true },
      ),
    );
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, { date: '2026-12-26', students: [['Anna', true]] });
    await user.click(screen.getByRole('button', { name: 'Review & submit' }));
    await user.click(screen.getByRole('button', { name: 'Submit · $10 due' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Lesson 1: Anna hasn't confirmed the waiver",
    );
    expect(path()).toBe('/insurance/new/review');
  });

  it.each([
    [
      { code: 'no_season', lessonIndex: 0 },
      400,
      'Lesson 1: no insurance season covers this date',
    ],
    [
      { code: 'no_season', lessonIndex: null },
      400,
      "No insurance season is open right now, so you can't insure lessons yet.",
    ],
    [
      { code: 'mixed_seasons' },
      400,
      'All the lessons in one request must be in the same season.',
    ],
    [
      { code: 'mixed_seasons', lessonIndex: 0, seasonKey: '2027/28' },
      400,
      'Lesson 1: all the lessons in one request must be in the same season (2027/28)',
    ],
    [
      { code: 'location_conflict', lessonIndex: 0 },
      400,
      'Lesson 1: choose a ski area or type another one, not both',
    ],
    [{ code: 'too_many_lessons' }, 400, 'A request holds up to 10 lessons.'],
    [{ code: 'locked' }, 403, 'Only approved instructors can insure lessons.'],
  ])('explains a %o response', async (body, status, message) => {
    serve();
    server.use(
      http.post(`${API}/me/insurance/requests`, () =>
        HttpResponse.json(body, { status }),
      ),
    );
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, { date: '2026-12-26', students: [['Anna', true]] });
    await user.click(screen.getByRole('button', { name: 'Review & submit' }));
    await user.click(screen.getByRole('button', { name: 'Submit · $10 due' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('reuses the idempotency key when a submit is retried', async () => {
    serve();
    server.use(
      http.post(
        `${API}/me/insurance/requests`,
        async ({ request }) => {
          state.posts.push((await request.json()) as never);
          return HttpResponse.json({ message: 'boom' }, { status: 500 });
        },
        { once: true },
      ),
    );
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, { date: '2026-12-26', students: [['Anna', true]] });
    await user.click(screen.getByRole('button', { name: 'Review & submit' }));
    await user.click(screen.getByRole('button', { name: 'Submit · $10 due' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Submit · $10 due' }));
    await waitFor(() => expect(path()).toBe('/insurance'));
    expect(state.posts).toHaveLength(2);
    expect(state.posts[1]!.idempotencyKey).toBe(state.posts[0]!.idempotencyKey);
  });

  it('ignores a corrupt saved draft', async () => {
    localStorage.setItem(DRAFT_KEY, '{"lessons": 3');
    serve();
    await renderPage();
    expect(screen.getByTestId('new-request')).toHaveTextContent(
      'New insurance request',
    );
  });
});

async function expectSubmittedIn(season: string, no: string, total: string) {
  await waitFor(() => expect(search().get('season')).toBe(season));
  await waitFor(() =>
    expect(screen.getByTestId('season-select')).toHaveValue(season),
  );
  const entries = await screen.findAllByTestId('entry');
  const entry = entries.find(
    (e) => within(e).getByTestId('entry-no').textContent === no,
  )!;
  expect(entry).toBeVisible();
  expect(within(entry).getByText('New')).toBeInTheDocument();
  expect(entry).toHaveClass('border-red');
  expect(within(entry).getByTestId('entry-total')).toHaveTextContent(total);
  expect(within(entry).getByTestId('request-status')).toHaveTextContent(
    'Unpaid',
  );
  expect(within(entry).getAllByTestId('tree-lesson')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent(`Submitted ${no}`);
}

describe('InsurancePage seasons', () => {
  function serveSeasons() {
    state = createInsuranceState(withRequests, {
      '2025/26': myInsurance({
        season: SEASON_2025,
        owedCents: 39000,
        unpaidCents: 39000,
      }),
      '2027/28': myInsurance({ season: SEASON_2027 }),
    });
    server.use(
      ...insuranceHandlers(state),
      http.get(`${API}/reference/teaching-locations`, () =>
        HttpResponse.json(LOCATIONS),
      ),
    );
  }

  it("insures a previous-season lesson against that season's totals", async () => {
    serveSeasons();
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, {
      date: '2026-02-14',
      hours: 2,
      students: [['Anna', true]],
    });
    await waitFor(() =>
      expect(screen.getByTestId('cap-total')).toHaveTextContent(
        'Season total $390 / $400',
      ),
    );
    expect(state.seasonQueries).toContain('2025/26');
    expect(screen.getByTestId('season-badge')).toHaveTextContent('2025/26');
    expect(within(cards()[0]!).getByTestId('lesson-price')).toHaveTextContent(
      'List $20 · $10 after cap',
    );
    expect(screen.queryByTestId('lesson-error')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review & submit' }));
    await user.click(screen.getByRole('button', { name: 'Submit · $10 due' }));
    await waitFor(() => expect(path()).toBe('/insurance'));
    expect(state.posts[0]!.lessons[0]!.lessonDate).toBe('2026-02-14');
    expect(state.seasons['2025/26']!.requests[0]!.seasonKey).toBe('2025/26');
    await expectSubmittedIn('2025/26', 'INS-20261018-0012', '$10');
    expect(screen.getByTestId('cap-total')).toHaveTextContent(
      'Season total $400 / $400',
    );
    expect(screen.getByRole('status')).toHaveClass('top-4');
  });

  it("insures a next-season lesson against that season's totals", async () => {
    serveSeasons();
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, { date: '2027-12-26', students: [['Anna', true]] });
    await waitFor(() =>
      expect(screen.getByTestId('cap-total')).toHaveTextContent(
        'Season total $0 / $400',
      ),
    );
    expect(state.seasonQueries).toContain('2027/28');
    expect(screen.getByTestId('draft-preview')).toHaveTextContent(
      'This request +$10 → $10',
    );
    await user.click(screen.getByRole('button', { name: 'Review & submit' }));
    expect(path()).toBe('/insurance/new/review');
    await user.click(screen.getByRole('button', { name: 'Submit · $10 due' }));
    await expectSubmittedIn('2027/28', 'INS-20261018-0012', '$10');
    expect(screen.getByTestId('cap-total')).toHaveTextContent(
      'Season total $10 / $400',
    );
  });

  it('lands a desktop submission on its season with the entry highlighted', async () => {
    setDesktop(true);
    serveSeasons();
    const { user } = await renderPage({
      route: '/insurance/new',
      locale: 'zh-CN',
    });
    await addLesson(
      user,
      { date: '2026-02-14', students: [['Anna', true]] },
      false,
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog')).getByTestId('cap-total'),
      ).toHaveTextContent('本季累计 $390 / $400'),
    );
    await user.click(screen.getByRole('button', { name: '核对并提交' }));
    await user.click(
      screen.getByRole('button', { name: '提交投保 · 应付 $10' }),
    );
    await waitFor(() => expect(path()).toBe('/insurance'));
    await waitFor(() => expect(search().get('season')).toBe('2025/26'));
    const entry = (await screen.findAllByTestId('entry')).find(
      (e) =>
        within(e).getByTestId('entry-no').textContent === 'INS-20261018-0012',
    )!;
    expect(entry).toBeVisible();
    expect(entry).toHaveClass('border-red');
    expect(within(entry).getByText('新')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('INS-20261018-0012');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('switches the list, progress and statuses with the season selector', async () => {
    serveSeasons();
    state.seasons['2025/26']!.requests = [
      buildRequest(
        {
          id: 'req-old',
          requestNo: 'INS-20260214-0003',
          createdAt: '2026-02-14T15:00:00Z',
          owedCents: 39000,
          seasonKey: '2025/26',
        },
        [
          {
            lessonDate: '2026-02-14',
            durationHours: 1,
            students: [{ name: 'Zoe', waiverConfirmed: true }],
          },
        ],
      ),
    ];
    const { user } = await renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('season-select')).toHaveValue('2026/27'),
    );
    expect(screen.getByText('INS-20261014-0011')).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('season-select'), '2025/26');
    await waitFor(() => expect(search().get('season')).toBe('2025/26'));
    expect(await screen.findByText('INS-20260214-0003')).toBeInTheDocument();
    expect(screen.queryByText('INS-20261014-0011')).not.toBeInTheDocument();
    expect(screen.getByTestId('season-select')).toHaveValue('2025/26');
    expect(screen.getByTestId('cap-total')).toHaveTextContent(
      'Season total $390 / $400',
    );
    expect(screen.getByTestId('request-status')).toHaveTextContent('Unpaid');
    expect(state.seasonQueries).toContain('2025/26');
  });

  it('blocks a request whose lessons span two seasons, naming the lesson', async () => {
    serveSeasons();
    const { user } = await renderPage({
      route: '/insurance/new',
      locale: 'zh-CN',
    });
    await addLesson(
      user,
      { date: '2026-12-26', students: [['Anna', true]] },
      false,
    );
    await addLesson(
      user,
      { date: '2027-12-26', students: [['Ben', true]] },
      false,
    );
    expect(within(cards()[1]!).getByTestId('lesson-error')).toHaveTextContent(
      '第 2 节：同一份投保里的课程需在同一雪季（2026/27）',
    );
    expect(
      within(cards()[0]!).queryByTestId('lesson-error'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '核对并提交' }));
    expect(path()).toBe('/insurance/new');
    expect(state.posts).toHaveLength(0);
  });

  it('flags a date in no season on that lesson', async () => {
    serveSeasons();
    const { user } = await renderPage({ route: '/insurance/new' });
    await addLesson(user, { date: '2027-07-01', students: [['Anna', true]] });
    expect(within(cards()[0]!).getByTestId('lesson-error')).toHaveTextContent(
      'Lesson 1: no insurance season covers this date',
    );
    await user.click(screen.getByRole('button', { name: 'Review & submit' }));
    expect(path()).toBe('/insurance/new');
  });
});

describe('fixtures', () => {
  it('seed requests owe $350 together', () => {
    expect(paidRequest.totalCents + unpaidRequest.totalCents).toBe(35000);
  });
});
