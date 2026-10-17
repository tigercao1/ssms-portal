import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
import { fakeProfile, server } from '@/test/msw';
import type { InstructorProfile } from '@/lib/types';
import { CALENDAR_GUIDE_URL } from './calendarGuide';

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
    expect(screen.getByText('English')).toBeInTheDocument();
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
