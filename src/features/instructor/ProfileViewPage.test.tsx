import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { ProfileViewPage } from './ProfileViewPage';
import { renderWithProviders } from '@/test/render';
import { fakeProfile, server } from '@/test/msw';
import type { InstructorProfile } from '@/lib/types';

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
            { id: 'l1', key: 'loc.whistler', name: 'Whistler', nameZh: '惠斯勒' },
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
