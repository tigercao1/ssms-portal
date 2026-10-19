import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SettingsPage } from './SettingsPage';
import { EMPLOYMENT_LETTER_FILENAME } from './EmploymentLetterCard';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw';
import type { EmploymentLetterStatus } from '@/lib/types';

const API = 'http://localhost:3000';

vi.mock('@/auth/SessionProvider', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSession: () => ({ user: { email: 'jane@example.com' } }),
}));

function letterStatus(status: EmploymentLetterStatus) {
  server.use(
    http.get(`${API}/me/employment-letter`, () => HttpResponse.json(status)),
  );
}

async function settled() {
  await waitFor(() =>
    expect(screen.getByText('jane@example.com')).toBeInTheDocument(),
  );
}

describe('EmploymentLetterCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is hidden while the feature is disabled', async () => {
    let asked = false;
    server.use(
      http.get(`${API}/me/employment-letter`, () => {
        asked = true;
        return HttpResponse.json({ state: 'disabled', legalName: null });
      }),
    );
    renderWithProviders(<SettingsPage />);
    await settled();
    await waitFor(() => expect(asked).toBe(true));
    expect(screen.queryByText('Employment letter')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download letter (PDF)' }),
    ).not.toBeInTheDocument();
  });

  it('is hidden when the status cannot be loaded', async () => {
    server.use(
      http.get(`${API}/me/employment-letter`, () =>
        HttpResponse.json({ message: 'Not found' }, { status: 404 }),
      ),
    );
    renderWithProviders(<SettingsPage />);
    await settled();
    expect(screen.queryByText('Employment letter')).not.toBeInTheDocument();
  });

  it('downloads the letter when enabled', async () => {
    letterStatus({ state: 'ready', legalName: 'Jane Elizabeth Snow' });
    let downloads = 0;
    server.use(
      http.get(`${API}/me/employment-letter/letter.pdf`, () => {
        downloads += 1;
        return new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          headers: { 'Content-Type': 'application/pdf' },
        });
      }),
    );
    const createObjectURL = vi.fn(() => 'blob:letter');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe(EMPLOYMENT_LETTER_FILENAME);
        expect(this.href).toBe('blob:letter');
      });

    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('Employment letter')).toBeInTheDocument();
    expect(
      screen.getByText('Issued to Jane Elizabeth Snow'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Download letter (PDF)' }),
    );

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(downloads).toBe(1);
    const blob = (createObjectURL.mock.calls[0] as unknown[])[0] as Blob;
    expect(blob.size).toBe(4);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:letter');
  });

  it('shows an error when the letter cannot be generated', async () => {
    letterStatus({ state: 'ready', legalName: 'Jane Snow' });
    server.use(
      http.get(`${API}/me/employment-letter/letter.pdf`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<SettingsPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Download letter (PDF)' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t create your letter. Please try again.',
    );
  });

  it('asks for the legal name instead of offering a download', async () => {
    letterStatus({ state: 'legal_name_missing', legalName: null });
    renderWithProviders(<SettingsPage />);
    expect(
      await screen.findByText(
        'Add your legal first and last name to your profile before you request an employment letter.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Add legal name' }),
    ).toHaveAttribute('href', '/profile/edit');
    expect(
      screen.queryByRole('button', { name: 'Download letter (PDF)' }),
    ).not.toBeInTheDocument();
  });

  it('explains when the instructor is not eligible yet', async () => {
    letterStatus({ state: 'not_eligible', legalName: null });
    renderWithProviders(<SettingsPage />);
    expect(
      await screen.findByText(
        'Employment letters are available once your profile is approved and your account is active.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download letter (PDF)' }),
    ).not.toBeInTheDocument();
  });

  it('is translated into Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    letterStatus({ state: 'legal_name_missing', legalName: null });
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('在职证明')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '填写法定姓名' }),
    ).toBeInTheDocument();
  });
});
