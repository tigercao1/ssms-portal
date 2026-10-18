import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { PreferredLanguageCard } from './PreferredLanguageCard';
import { ProfileViewPage } from './ProfileViewPage';
import { SettingsPage } from './SettingsPage';
import { renderWithProviders } from '@/test/render';
import { fakeProfile, server } from '@/test/msw';

const API = 'http://localhost:3000';

vi.mock('@/auth/SessionProvider', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSession: () => ({ user: { email: 'jane@example.com' } }),
}));

function capturePatches() {
  const bodies: unknown[] = [];
  server.use(
    http.patch(`${API}/me/instructor`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      return HttpResponse.json({ ...fakeProfile, ...body });
    }),
  );
  return bodies;
}

describe('PreferredLanguageCard', () => {
  it('starts from the profile preference, not the site language', () => {
    renderWithProviders(
      <PreferredLanguageCard
        profile={{ ...fakeProfile, preferredLanguage: 'zh-CN' }}
      />,
    );
    expect(screen.getByLabelText('Preferred language')).toHaveValue('zh-CN');
    expect(document.documentElement.lang).toBe('en');
  });

  it('saves the chosen language without changing the site language', async () => {
    const bodies = capturePatches();
    renderWithProviders(<PreferredLanguageCard profile={fakeProfile} />);
    const select = screen.getByLabelText('Preferred language');
    expect(select).toHaveValue('en');

    await userEvent.selectOptions(select, 'zh-CN');

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(bodies).toEqual([{ preferredLanguage: 'zh-CN' }]);
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('ssms.locale')).toBe('en');
  });

  it('shows an error and keeps the saved value when the save fails', async () => {
    server.use(
      http.patch(`${API}/me/instructor`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<PreferredLanguageCard profile={fakeProfile} />);
    const select = screen.getByLabelText('Preferred language');

    await userEvent.selectOptions(select, 'zh-CN');

    expect(
      await screen.findByText('Something went wrong.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(select).toHaveValue('en'));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('shows the label and hint in Chinese', () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(<PreferredLanguageCard profile={fakeProfile} />);
    expect(screen.getByLabelText('首选语言')).toHaveValue('en');
    expect(screen.getByText(/填写简介时的默认语言/)).toBeInTheDocument();
  });

  it('appears on the profile page', async () => {
    renderWithProviders(<ProfileViewPage />);
    expect(
      await screen.findByLabelText('Preferred language'),
    ).toBeInTheDocument();
  });

  it('is no longer on the settings page', () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Preferred language'),
    ).not.toBeInTheDocument();
  });
});
