import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SettingsPage } from './SettingsPage';
import { renderWithProviders } from '@/test/render';
import { fakeProfile, server } from '@/test/msw';

const API = 'http://localhost:3000';

vi.mock('@/auth/SessionProvider', () => ({
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

describe('SettingsPage email language', () => {
  it('starts from the profile preference, not the site language', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, preferredLanguage: 'zh-CN' }),
      ),
    );
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByLabelText('Email language')).toHaveValue('zh-CN');
    expect(document.documentElement.lang).toBe('en');
  });

  it('saves the chosen language without changing the site language', async () => {
    const bodies = capturePatches();
    renderWithProviders(<SettingsPage />);
    const select = await screen.findByLabelText('Email language');
    expect(select).toHaveValue('en');

    await userEvent.selectOptions(select, 'zh-CN');

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(bodies).toEqual([{ preferredLanguage: 'zh-CN' }]);
    expect(screen.getByLabelText('Email language')).toHaveValue('zh-CN');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('ssms.locale')).toBe('en');
    expect(
      screen.getByRole('heading', { name: 'Settings' }),
    ).toBeInTheDocument();
  });

  it('shows an error and keeps the saved value when the save fails', async () => {
    server.use(
      http.patch(`${API}/me/instructor`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<SettingsPage />);
    const select = await screen.findByLabelText('Email language');

    await userEvent.selectOptions(select, 'zh-CN');

    expect(
      await screen.findByText('Something went wrong.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(select).toHaveValue('en'));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('shows the label and hint in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByLabelText('邮件语言')).toHaveValue('en');
    expect(screen.getByText(/如需切换网站语言/)).toBeInTheDocument();
  });

  it('shows an error when the profile fails to load', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<SettingsPage />);
    expect(
      await screen.findByText('Something went wrong.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Email language')).not.toBeInTheDocument();
  });
});
