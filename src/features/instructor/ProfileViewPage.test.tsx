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
    // cert display string from the API
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
