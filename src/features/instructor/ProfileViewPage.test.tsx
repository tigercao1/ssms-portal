import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { ProfileViewPage } from './ProfileViewPage';
import { renderWithProviders } from '@/test/render';
import { fakeGoLive, fakeProfile, server } from '@/test/msw';
import type { GoLiveReadiness, InstructorProfile } from '@/lib/types';
import { GO_LIVE_POLL_MS, useUpdateProfile } from './api';
import { CALENDAR_GUIDE_URL } from './calendarGuide';
import type {
  CertState,
  CertificationChecklistItem,
  ChecklistItem,
  DocumentChecklistItem,
  MyChecklist,
} from '@/features/documents/api';

const API = 'http://localhost:3000';

describe('ProfileViewPage (W2.1)', () => {
  it('renders the fetched profile, status and certifications', async () => {
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('Jane Snow')).toBeInTheDocument();
    // pending status pill
    expect(screen.getByText('Pending')).toBeInTheDocument();
    // certification label
    expect(screen.getByText('CSIA Level 4')).toBeInTheDocument();
    // location chip
    expect(screen.getByText('Whistler')).toBeInTheDocument();
  });

  it('shows the minimum student age', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, minStudentAge: 8 }),
      ),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('Minimum student age')).toBeInTheDocument();
    expect(screen.getByText('Ages 8+')).toBeInTheDocument();
  });

  it('shows the minimum student age in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('最小学员年龄')).toBeInTheDocument();
    expect(screen.getByText('5 岁及以上')).toBeInTheDocument();
  });

  it('hides the minimum student age when the profile lacks it', async () => {
    const legacy: Partial<InstructorProfile> = { ...fakeProfile };
    delete legacy.minStudentAge;
    server.use(
      http.get(`${API}/me/instructor`, () => HttpResponse.json(legacy)),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('Jane Snow')).toBeInTheDocument();
    expect(screen.queryByText('Minimum student age')).not.toBeInTheDocument();
  });
});

describe('ProfileViewPage legal name', () => {
  it('shows the legal name when both names are set', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({
          ...fakeProfile,
          firstName: 'Janet',
          lastName: 'Snowden',
        }),
      ),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(
      await screen.findByText('Legal name: Janet Snowden'),
    ).toBeInTheDocument();
  });

  it('labels the legal name in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, firstName: '简', lastName: '雪' }),
      ),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('法定姓名: 简 雪')).toBeInTheDocument();
  });

  it('hides the legal name when it is not set', async () => {
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('Jane Snow')).toBeInTheDocument();
    expect(screen.queryByText(/Legal name/)).not.toBeInTheDocument();
  });
});

describe('ProfileViewPage machine-translation badge', () => {
  const translated: InstructorProfile = {
    ...fakeProfile,
    bioEn: 'Veteran instructor.',
    bioZh: '资深教练。',
    bioZhMachineTranslated: true,
    bioZhTranslatedBy: 'gemini-2.5-flash',
  };

  it('shows the model name next to a machine-translated bio', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    server.use(
      http.get(`${API}/me/instructor`, () => HttpResponse.json(translated)),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('资深教练。')).toBeInTheDocument();
    expect(screen.getByText('由 gemini-2.5-flash 翻译')).toBeInTheDocument();
  });

  it('hides the badge when the displayed bio was written by the instructor', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () => HttpResponse.json(translated)),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('Veteran instructor.')).toBeInTheDocument();
    expect(screen.queryByText(/Translated by/)).not.toBeInTheDocument();
  });

  it('badges the English bio when it was machine-translated', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({
          ...fakeProfile,
          bioEn: 'Veteran instructor.',
          bioEnTranslatedBy: 'gemini-2.5-flash',
        }),
      ),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(
      await screen.findByText('Translated by gemini-2.5-flash'),
    ).toBeInTheDocument();
  });
});

describe('ProfileViewPage reference names', () => {
  it('shows Chinese reference names in Chinese when the API provides them', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({
          ...fakeProfile,
          teachingLocations: [
            {
              id: 'l1',
              key: 'loc.whistler',
              name: 'Whistler',
              nameZh: '惠斯勒',
            },
          ],
        }),
      ),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('惠斯勒')).toBeInTheDocument();
    expect(
      screen.getByText('English', { selector: ':not(option)' }),
    ).toBeInTheDocument();
  });
});

describe('ProfileViewPage certification tracks', () => {
  const tracked: InstructorProfile = {
    ...fakeProfile,
    certifications: [
      {
        org: 'csia',
        track: 'park',
        level: 1,
        isPartial: false,
        partialComponents: [],
        achievedOn: null,
        display: 'CSIA Park Level 1',
      },
      {
        org: 'casi',
        track: 'carving',
        level: 2,
        isPartial: false,
        partialComponents: [],
        achievedOn: null,
        display: 'CASI Carving Level 2',
      },
      {
        org: 'csia',
        track: 'regular',
        level: 3,
        isPartial: true,
        partialComponents: [],
        achievedOn: null,
        display: 'CSIA Level 3 Partial',
      },
    ],
  };

  it('shows track names in English', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () => HttpResponse.json(tracked)),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('CSIA Park Level 1')).toBeInTheDocument();
    expect(screen.getByText('CASI Carving Level 2')).toBeInTheDocument();
    expect(screen.getByText('CSIA Level 3 Partial')).toBeInTheDocument();
  });

  it('shows track names in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    server.use(
      http.get(`${API}/me/instructor`, () => HttpResponse.json(tracked)),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('CSIA 公园 级别 1')).toBeInTheDocument();
    expect(screen.getByText('CASI 刻滑 级别 2')).toBeInTheDocument();
    expect(screen.getByText('CSIA 级别 3 部分完成')).toBeInTheDocument();
  });
});

describe('ProfileViewPage more photos', () => {
  it('shows photos 2 and 3 when present', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({
          ...fakeProfile,
          photo2Url: 'http://storage.test/p2.png',
          photo3Url: 'http://storage.test/p3.png',
        }),
      ),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(
      await screen.findByRole('heading', { name: 'More photos' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Jane Snow — Photo 2' }),
    ).toHaveAttribute('src', 'http://storage.test/p2.png');
    expect(
      screen.getByRole('img', { name: 'Jane Snow — Photo 3' }),
    ).toHaveAttribute('src', 'http://storage.test/p3.png');
  });

  it('hides the section when there are no extra photos', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, photo2Url: null }),
      ),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('Jane Snow')).toBeInTheDocument();
    expect(screen.queryByText('More photos')).not.toBeInTheDocument();
  });
});

describe('ProfileViewPage approval status', () => {
  afterEach(() => {
    focusManager.setFocused(undefined);
  });

  it('shows the rejected banner and status', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, approvalStatus: 'rejected' }),
      ),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('Rejected')).toBeInTheDocument();
    expect(
      screen.getByText(/Your profile was not approved/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pending review/)).not.toBeInTheDocument();
  });

  it('picks up a rejection when the tab regains focus', async () => {
    let profile: InstructorProfile = fakeProfile;
    server.use(
      http.get(`${API}/me/instructor`, () => HttpResponse.json(profile)),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 30_000,
          refetchOnWindowFocus: false,
        },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <I18nProvider>
          <MemoryRouter>
            <ProfileViewPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/pending review/)).toBeInTheDocument();

    profile = { ...fakeProfile, approvalStatus: 'rejected' };
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(
      await screen.findByText(/Your profile was not approved/),
    ).toBeInTheDocument();
  });
});

describe('ProfileViewPage Google Calendar', () => {
  const profileWith = (overrides: Partial<InstructorProfile>) =>
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, ...overrides }),
      ),
    );
  const approved = () => profileWith({ approvalStatus: 'approved' });
  const calendar = (connected: boolean) => {
    const requests: string[] = [];
    server.use(
      http.get(`${API}/me/instructor/calendar`, ({ request }) => {
        requests.push(request.url);
        return HttpResponse.json({ connected });
      }),
    );
    return requests;
  };

  it('shows a green Connected pill and no guide link when connected', async () => {
    approved();
    calendar(true);
    renderWithProviders(<ProfileViewPage />);
    expect(
      await screen.findByText('Connected', {
        selector: '.text-status-approved',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Google Calendar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your Google Calendar is connected/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'How to connect your calendar' }),
    ).not.toBeInTheDocument();
  });

  it('shows an amber Not connected pill and the guide link when not connected', async () => {
    approved();
    const requests = calendar(false);
    renderWithProviders(<ProfileViewPage />);
    expect(
      await screen.findByText('Not connected', {
        selector: '.text-status-pending',
      }),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    expect(
      screen.getByText(/Your Google Calendar isn’t connected yet/),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: 'How to connect your calendar',
    });
    expect(link).toHaveAttribute('href', CALENDAR_GUIDE_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows the section to an approved but inactive instructor', async () => {
    profileWith({ approvalStatus: 'approved', isActive: false });
    renderWithProviders(<ProfileViewPage />);
    expect(
      await screen.findByRole('heading', { name: 'Google Calendar' }),
    ).toBeInTheDocument();
  });

  it.each(['pending', 'rejected'] as const)(
    'hides the section and skips the request for a %s instructor',
    async (approvalStatus) => {
      profileWith({ approvalStatus });
      const requests = calendar(true);
      renderWithProviders(<ProfileViewPage />);
      expect(await screen.findByText('Jane Snow')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(requests).toHaveLength(0);
      expect(
        screen.queryByRole('heading', { name: 'Google Calendar' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('status', { name: 'Loading' }),
      ).not.toBeInTheDocument();
    },
  );

  it('hides the section when the calendar status fails to load', async () => {
    approved();
    server.use(
      http.get(`${API}/me/instructor/calendar`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('Jane Snow')).toBeInTheDocument();
    expect(screen.getByText('CSIA Level 4')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'Loading' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'Google Calendar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'How to connect your calendar' }),
    ).not.toBeInTheDocument();
  });

  it('labels the section in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    approved();
    renderWithProviders(<ProfileViewPage />);
    expect(
      await screen.findByText('未连接', { selector: '.text-status-pending' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Google 日历' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '如何连接日历' })).toHaveAttribute(
      'href',
      CALENDAR_GUIDE_URL,
    );
  });

  it('labels the connected state in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    approved();
    calendar(true);
    renderWithProviders(<ProfileViewPage />);
    expect(
      await screen.findByText('已连接', { selector: '.text-status-approved' }),
    ).toBeInTheDocument();
  });
});

describe('ProfileViewPage go-live', () => {
  function serveGoLive(
    profileOverrides: Partial<InstructorProfile>,
    goLive: Partial<GoLiveReadiness> = {},
  ) {
    const requests: string[] = [];
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, ...profileOverrides }),
      ),
      http.get(`${API}/me/go-live`, ({ request }) => {
        requests.push(request.url);
        return HttpResponse.json({ ...fakeGoLive, ...goLive });
      }),
    );
    return requests;
  }
  function serveChecklist(items: ChecklistItem[]) {
    server.use(
      http.get(`${API}/me/documents`, () =>
        HttpResponse.json({
          season: '2026/27',
          locked: false,
          lockReason: null,
          complete: false,
          items,
        } satisfies MyChecklist),
      ),
    );
  }
  function doc(
    assignmentId: string,
    status: DocumentChecklistItem['status'],
  ): DocumentChecklistItem {
    return {
      type: 'document',
      assignmentId,
      templateId: `tpl-${assignmentId}`,
      kind: 'sign',
      titleEn: 'Independent contractor agreement',
      titleZh: '独立承包人协议',
      descriptionEn: null,
      descriptionZh: null,
      required: true,
      status,
      season: '2026/27',
      assignedAt: '2026-10-01T00:00:00Z',
      viewedAt: null,
      completedAt: null,
      dueAt: null,
      languages: ['en'],
    };
  }
  function cert(state: CertState): CertificationChecklistItem {
    return {
      type: 'certification',
      org: 'csia',
      track: 'regular',
      level: 4,
      uploadId: state === 'missing' ? null : 'cu-1',
      reviewStatus: null,
      reviewNote: null,
      validUntil: '2027-06-30',
      state,
    };
  }
  async function findCard() {
    const heading = await screen.findByRole('heading', {
      name: /^(Onboarding|入职资料)$/,
    });
    return within(heading.parentElement!.parentElement!);
  }
  function pillColor(text: HTMLElement) {
    return text.closest('span')!.style.borderColor;
  }
  const approvedActive = {
    approvalStatus: 'approved',
    isActive: true,
  } as const;
  const liveUrl = 'https://ssnow.club/pages/our-team/jane-snow';
  const toDoItems = [
    doc('asg-contract', 'assigned'),
    doc('asg-handbook', 'completed'),
    cert('pending'),
  ];

  it('no longer lists the missing items on the profile', async () => {
    serveGoLive(approvedActive);
    serveChecklist(toDoItems);
    renderWithProviders(<ProfileViewPage />);
    await findCard();
    expect(
      screen.queryByText(/things? left before your profile goes live/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No verified certification yet')).toBeNull();
    expect(
      screen.queryByRole('link', { name: /^(Add|View|Open):/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Not live')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('shows a yellow "Required items pending" card with the count and items in review', async () => {
    serveGoLive(approvedActive, {
      missing: fakeGoLive.missing.filter((m) => m.group !== 'profile'),
    });
    serveChecklist(toDoItems);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    const pill = await card.findByText('Required items pending');
    expect(pillColor(pill)).toBe('var(--status-pending)');
    expect(
      card.getByText(
        '1 of 3 done · 1 awaiting review. Finish the rest to go live on the SSnow official website.',
      ),
    ).toBeInTheDocument();
    expect(
      card.getByRole('progressbar', {
        name: '1 of 3 done · 1 awaiting review',
      }),
    ).toHaveAttribute('aria-valuenow', '1');
    expect(
      card.getByRole('link', { name: 'Go to onboarding' }),
    ).toHaveAttribute('href', '/onboarding');
    expect(card.queryByText(/Your profile also needs/)).toBeNull();
  });

  it('leaves out the review count when nothing is awaiting review', async () => {
    serveGoLive(approvedActive, {
      missing: fakeGoLive.missing.filter((m) => m.group === 'onboarding'),
    });
    serveChecklist([
      doc('asg-contract', 'assigned'),
      doc('asg-handbook', 'completed'),
    ]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    expect(
      await card.findByText(
        '1 of 2 done. Finish the rest to go live on the SSnow official website.',
      ),
    ).toBeInTheDocument();
    expect(card.getByText('Required items pending')).toBeInTheDocument();
  });

  it('shows "Awaiting review" when everything is submitted and a certification is in review', async () => {
    serveGoLive(approvedActive, {
      missing: [{ group: 'certification', reason: 'none_verified' }],
    });
    serveChecklist([doc('asg-contract', 'completed'), cert('pending')]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    const pill = await card.findByText('Awaiting review');
    expect(pillColor(pill)).toBe('var(--status-pending)');
    expect(
      card.getByText(
        "We're checking your certification. You'll go live once it's approved.",
      ),
    ).toBeInTheDocument();
    expect(
      card.getByRole('progressbar', {
        name: '1 of 2 done · 1 awaiting review',
      }),
    ).toBeInTheDocument();
  });

  it('keeps "Required items pending" and names the profile gaps while a certification is in review', async () => {
    serveGoLive(approvedActive, {
      missing: [
        { group: 'profile', field: 'photo' },
        { group: 'certification', reason: 'none_verified' },
      ],
    });
    serveChecklist([doc('asg-contract', 'completed'), cert('pending')]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    expect(await card.findByText('Required items pending')).toBeInTheDocument();
    expect(
      card.getByText('Your profile also needs: main photo.'),
    ).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
      'href',
      '/profile/edit',
    );
  });

  it('lists every missing profile field in one sentence', async () => {
    serveGoLive(approvedActive, {
      missing: [
        { group: 'profile', field: 'displayNameEn' },
        { group: 'profile', field: 'bio' },
        { group: 'profile', field: 'locations' },
        { group: 'profile', field: 'languages' },
        { group: 'profile', field: 'courseLevels' },
      ],
    });
    serveChecklist([doc('asg-contract', 'completed'), cert('valid')]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    expect(
      await card.findByText(
        'Your profile also needs: English display name, bio, teaching location, language, and course level offered.',
      ),
    ).toBeInTheDocument();
    expect(card.getByText('Required items pending')).toBeInTheDocument();
    expect(
      card.getByText(
        '2 of 2 done. Finish the rest to go live on the SSnow official website.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a navy "Going live" card for a ready instructor', async () => {
    serveGoLive(approvedActive, { ready: true, missing: [] });
    serveChecklist([doc('asg-contract', 'completed'), cert('valid')]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    const pill = await card.findByText('Going live');
    expect(pillColor(pill)).toBe('var(--navy)');
    expect(card.getByText('Usually within a few minutes.')).toBeInTheDocument();
    expect(screen.getByText('Not live')).toBeInTheDocument();
    expect(screen.queryByText('Your profile is live.')).toBeNull();
  });

  it('links a live instructor to the public page and marks the card all done', async () => {
    serveGoLive(approvedActive, {
      live: true,
      ready: true,
      liveUrl,
      missing: [],
    });
    serveChecklist([doc('asg-contract', 'completed'), cert('valid')]);
    renderWithProviders(<ProfileViewPage />);
    expect(
      await screen.findByText('Your profile is live.'),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: 'View it on the SSnow official website ↗',
    });
    expect(link).toHaveAttribute('href', liveUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByText('Not live')).not.toBeInTheDocument();
    const card = await findCard();
    const pill = await card.findByText('All done');
    expect(pillColor(pill)).toBe('var(--status-approved)');
    expect(
      card.getByText(
        'Documents to read and sign, and certifications to upload.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the live banner in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveGoLive(approvedActive, {
      live: true,
      ready: true,
      liveUrl,
      missing: [],
    });
    serveChecklist([doc('asg-contract', 'completed'), cert('valid')]);
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('您的资料已上线。')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '在 SSnow 官网查看 ↗' }),
    ).toHaveAttribute('href', liveUrl);
    expect(screen.getByText('已上线')).toBeInTheDocument();
    expect(await (await findCard()).findByText('全部完成')).toBeInTheDocument();
  });

  it('switches the card from going live to the live banner once Shopify publishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let live = false;
      server.use(
        http.get(`${API}/me/instructor`, () =>
          HttpResponse.json({ ...fakeProfile, ...approvedActive }),
        ),
        http.get(`${API}/me/go-live`, () =>
          HttpResponse.json({
            ...fakeGoLive,
            ready: true,
            live,
            liveUrl: live ? liveUrl : null,
            missing: [],
          }),
        ),
      );
      serveChecklist([doc('asg-contract', 'completed'), cert('valid')]);
      renderWithProviders(<ProfileViewPage />);
      expect(await screen.findByText('Going live')).toBeInTheDocument();

      live = true;
      await act(() => vi.advanceTimersByTimeAsync(GO_LIVE_POLL_MS));

      expect(
        await screen.findByText('Your profile is live.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Live')).toBeInTheDocument();
      expect(screen.getByText('All done')).toBeInTheDocument();
      expect(screen.queryByText('Going live')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops checking once the profile is live', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const requests = serveGoLive(approvedActive, {
        ready: true,
        live: true,
        liveUrl,
        missing: [],
      });
      renderWithProviders(<ProfileViewPage />);
      expect(
        await screen.findByText('Your profile is live.'),
      ).toBeInTheDocument();
      const before = requests.length;

      await act(() => vi.advanceTimersByTimeAsync(GO_LIVE_POLL_MS * 3));

      expect(requests).toHaveLength(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the going-live card in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveGoLive(approvedActive, { ready: true, missing: [] });
    serveChecklist([doc('asg-contract', 'completed'), cert('valid')]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    expect(await card.findByText('上线中')).toBeInTheDocument();
    expect(card.getByText('通常几分钟内完成。')).toBeInTheDocument();
    expect(screen.getByText('未上线')).toBeInTheDocument();
  });

  it('shows the to-do card and profile gaps in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveGoLive(approvedActive, {
      missing: [
        { group: 'profile', field: 'photo' },
        { group: 'profile', field: 'bio' },
        ...fakeGoLive.missing.filter((m) => m.group !== 'profile'),
      ],
    });
    serveChecklist(toDoItems);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    expect(await card.findByText('有待完成事项')).toBeInTheDocument();
    expect(
      card.getByText(
        '已完成 1 / 3 · 1 项待审核。完成其余事项即可在 SSnow 官网上线。',
      ),
    ).toBeInTheDocument();
    expect(
      card.getByText('您的资料还需要：主照片和简介。'),
    ).toBeInTheDocument();
    expect(card.getByRole('link', { name: '编辑资料' })).toHaveAttribute(
      'href',
      '/profile/edit',
    );
  });

  it('shows the awaiting-review card in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveGoLive(approvedActive, {
      missing: [{ group: 'certification', reason: 'none_verified' }],
    });
    serveChecklist([doc('asg-contract', 'completed'), cert('pending')]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    expect(await card.findByText('待审核')).toBeInTheDocument();
    expect(
      card.getByText('我们正在审核您的证书，通过后即可上线。'),
    ).toBeInTheDocument();
    expect(
      card.getByRole('progressbar', { name: '已完成 1 / 2 · 1 项待审核' }),
    ).toBeInTheDocument();
  });

  it('puts the onboarding card above the preferred language card', async () => {
    serveGoLive(approvedActive);
    serveChecklist(toDoItems);
    renderWithProviders(<ProfileViewPage />);
    const heading = await screen.findByRole('heading', { name: 'Onboarding' });
    const language = screen.getByText('Preferred language');
    expect(
      heading.compareDocumentPosition(language) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows the go-live status and profile gaps when the checklist is empty', async () => {
    serveGoLive(approvedActive, {
      missing: [
        { group: 'profile', field: 'photo' },
        { group: 'profile', field: 'bio' },
      ],
    });
    serveChecklist([]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    const pill = await card.findByText('Required items pending');
    expect(pillColor(pill)).toBe('var(--status-pending)');
    expect(
      card.getByText(
        'Complete your profile to go live on the SSnow official website.',
      ),
    ).toBeInTheDocument();
    expect(
      card.getByText('Your profile also needs: main photo and bio.'),
    ).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
      'href',
      '/profile/edit',
    );
    expect(card.queryByRole('progressbar')).toBeNull();
    expect(card.queryByText(/of \d+ done/)).toBeNull();
    expect(card.queryByRole('link', { name: 'Go to onboarding' })).toBeNull();
  });

  it('shows the empty-checklist status and profile gaps in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveGoLive(approvedActive, {
      missing: [
        { group: 'profile', field: 'photo' },
        { group: 'profile', field: 'bio' },
      ],
    });
    serveChecklist([]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    expect(await card.findByText('有待完成事项')).toBeInTheDocument();
    expect(
      card.getByText('完善您的资料即可在 SSnow 官网上线。'),
    ).toBeInTheDocument();
    expect(
      card.getByText('您的资料还需要：主照片和简介。'),
    ).toBeInTheDocument();
    expect(card.getByRole('link', { name: '编辑资料' })).toHaveAttribute(
      'href',
      '/profile/edit',
    );
    expect(card.queryByRole('progressbar')).toBeNull();
    expect(card.queryByRole('link', { name: '前往入职资料' })).toBeNull();
  });

  it('asks for a certification when the checklist is empty and none is verified', async () => {
    serveGoLive(approvedActive, {
      missing: [
        { group: 'profile', field: 'photo' },
        { group: 'certification', reason: 'none_verified' },
      ],
    });
    serveChecklist([]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    expect(
      await card.findByText(
        'Your profile also needs: main photo and a certification.',
      ),
    ).toBeInTheDocument();
    expect(card.getByText('Required items pending')).toBeInTheDocument();
  });

  it('asks for a certification in Chinese when the checklist is empty', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveGoLive(approvedActive, {
      missing: [{ group: 'certification', reason: 'none_verified' }],
    });
    serveChecklist([]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    expect(await card.findByText('您的资料还需要：证书。')).toBeInTheDocument();
  });

  it('shows "Going live" for an empty checklist', async () => {
    serveGoLive(approvedActive, { ready: true, missing: [] });
    serveChecklist([]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    const pill = await card.findByText('Going live');
    expect(pillColor(pill)).toBe('var(--navy)');
    expect(card.getByText('Usually within a few minutes.')).toBeInTheDocument();
    expect(card.queryByText(/Complete your profile/)).toBeNull();
    expect(card.queryByText(/Your profile also needs/)).toBeNull();
    expect(card.queryByRole('progressbar')).toBeNull();
    expect(card.queryByRole('link', { name: 'Go to onboarding' })).toBeNull();
  });

  it('shows "All done" for a live instructor with an empty checklist', async () => {
    serveGoLive(approvedActive, {
      live: true,
      ready: true,
      liveUrl,
      missing: [],
    });
    serveChecklist([]);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    const pill = await card.findByText('All done');
    expect(pillColor(pill)).toBe('var(--status-approved)');
    expect(
      card.getByText(
        'Documents to read and sign, and certifications to upload.',
      ),
    ).toBeInTheDocument();
    expect(card.queryByRole('progressbar')).toBeNull();
    expect(card.queryByRole('link', { name: 'Go to onboarding' })).toBeNull();
  });

  it('hides the card for an empty checklist when go-live has not loaded', async () => {
    let checklistServed = false;
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, ...approvedActive }),
      ),
      http.get(`${API}/me/go-live`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
      http.get(`${API}/me/documents`, () => {
        checklistServed = true;
        return HttpResponse.json({
          season: '2026/27',
          locked: false,
          lockReason: null,
          complete: false,
          items: [],
        } satisfies MyChecklist);
      }),
    );
    renderWithProviders(<ProfileViewPage />);
    expect(await screen.findByText('Preferred language')).toBeInTheDocument();
    await waitFor(() => expect(checklistServed).toBe(true));
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole('heading', { name: 'Onboarding' })).toBeNull();
  });

  it('shows the plain progress count when go-live has not loaded', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, ...approvedActive }),
      ),
      http.get(`${API}/me/go-live`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    serveChecklist(toDoItems);
    renderWithProviders(<ProfileViewPage />);
    const card = await findCard();
    expect(
      await card.findByText('1 of 3 done · 1 awaiting review'),
    ).toBeInTheDocument();
    expect(card.queryByText('Required items pending')).toBeNull();
  });

  it.each([
    ['pending', true, /Your profile is pending review/],
    ['rejected', true, /Your profile was not approved/],
    ['approved', false, /Your profile is deactivated/],
  ] as const)(
    'keeps the %s banner (active: %s) and shows no live pill',
    async (approvalStatus, isActive, banner) => {
      serveGoLive({ approvalStatus, isActive });
      renderWithProviders(<ProfileViewPage />);
      expect(await screen.findByText(banner)).toBeInTheDocument();
      expect(screen.queryByText('Not live')).not.toBeInTheDocument();
      expect(screen.queryByText('Live')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Required items pending'),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    ['verified', 'Verified · until Jun 30, 2027'],
    ['pending', 'Awaiting review'],
    ['rejected', 'Proof rejected'],
    ['expired', 'Proof expired'],
    ['no_proof', 'No proof uploaded'],
    ['level_mismatch', 'Re-verification needed'],
  ] as const)('marks a %s certification "%s"', async (status, label) => {
    serveGoLive(approvedActive, {
      certifications: [
        {
          org: 'csia',
          track: 'regular',
          level: 4,
          status,
          validUntil: '2027-06-30',
        },
      ],
    });
    renderWithProviders(<ProfileViewPage />);
    const row = (await screen.findByText('CSIA Level 4')).closest('li')!;
    expect(await within(row).findByText(label)).toBeInTheDocument();
  });

  it('marks certification status in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveGoLive(approvedActive);
    renderWithProviders(<ProfileViewPage />);
    const row = (await screen.findByText('CSIA 级别 4')).closest('li')!;
    expect(await within(row).findByText('待审核')).toBeInTheDocument();
  });

  it('refreshes the card after the profile is saved', async () => {
    let photo = false;
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, ...approvedActive }),
      ),
      http.get(`${API}/me/go-live`, () =>
        HttpResponse.json(
          photo
            ? { ...fakeGoLive, ready: true, missing: [] }
            : {
                ...fakeGoLive,
                missing: [{ group: 'profile', field: 'photo' }],
              },
        ),
      ),
      http.patch(`${API}/me/instructor`, () => {
        photo = true;
        return HttpResponse.json({ ...fakeProfile, ...approvedActive });
      }),
    );
    serveChecklist([doc('asg-contract', 'completed'), cert('valid')]);
    function SaveButton() {
      const update = useUpdateProfile();
      return (
        <button type="button" onClick={() => update.mutate({})}>
          Save
        </button>
      );
    }
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ProfileViewPage />
        <SaveButton />
      </>,
      { staleTime: 60_000 },
    );
    expect(
      await screen.findByText('Your profile also needs: main photo.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Going live')).toBeInTheDocument();
    expect(screen.queryByText(/Your profile also needs/)).toBeNull();
  });
});
