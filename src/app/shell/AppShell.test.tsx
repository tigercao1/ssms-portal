import { describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Route,
  Routes,
  useNavigate,
  type NavigateFunction,
} from 'react-router-dom';
import { AppShell } from './AppShell';
import { renderWithProviders } from '@/test/render';

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({
    isAdmin: true,
    user: { email: 'admin@example.com' },
    signOut: vi.fn(),
  }),
}));

let navigate: NavigateFunction;

function CaptureNavigate() {
  navigate = useNavigate();
  return null;
}

function renderShell() {
  renderWithProviders(
    <>
      <CaptureNavigate />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<p>Dashboard page</p>} />
          <Route path="/admin/instructors" element={<p>Instructors page</p>} />
        </Route>
      </Routes>
    </>,
    { route: '/admin' },
  );
}

function hamburger() {
  return screen.getByRole('button', { name: 'Open menu' });
}

function menu() {
  return document.getElementById('app-nav')!;
}

async function openMenu() {
  await userEvent.click(hamburger());
  return screen.getByRole('button', { name: 'Close menu' });
}

describe('AppShell mobile menu', () => {
  it('starts collapsed', () => {
    renderShell();
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expect(hamburger()).toHaveAttribute('aria-controls', 'app-nav');
    expect(menu()).toHaveClass('hidden');
    expect(document.body).not.toHaveClass('overflow-hidden');
  });

  it('opens a full-screen overlay and focuses the close button', async () => {
    renderShell();
    const close = await openMenu();
    expect(hamburger()).toHaveAttribute('aria-expanded', 'true');
    expect(menu()).toHaveClass('fixed', 'inset-0');
    expect(menu()).not.toHaveClass('hidden');
    expect(close).toHaveFocus();
    expect(document.body).toHaveClass('overflow-hidden');
  });

  it('closes via the close button and returns focus to the hamburger', async () => {
    renderShell();
    await userEvent.click(await openMenu());
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expect(menu()).toHaveClass('hidden');
    expect(hamburger()).toHaveFocus();
    expect(document.body).not.toHaveClass('overflow-hidden');
  });

  it('closes on Escape', async () => {
    renderShell();
    await openMenu();
    await userEvent.keyboard('{Escape}');
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expect(menu()).toHaveClass('hidden');
    expect(hamburger()).toHaveFocus();
  });

  it('closes when a nav link is clicked', async () => {
    renderShell();
    await openMenu();
    await userEvent.click(screen.getByRole('link', { name: 'Instructors' }));
    expect(screen.getByText('Instructors page')).toBeInTheDocument();
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expect(menu()).toHaveClass('hidden');
  });

  it('closes and releases the scroll lock when the route changes elsewhere', async () => {
    renderShell();
    await openMenu();
    act(() => navigate('/admin/instructors'));
    expect(screen.getByText('Instructors page')).toBeInTheDocument();
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expect(menu()).toHaveClass('hidden');
    expect(menu()).not.toHaveClass('fixed');
    expect(document.body).not.toHaveClass('overflow-hidden');
  });

  it('keeps the desktop sidebar classes whether or not the menu is open', async () => {
    renderShell();
    const desktop = ['lg:relative', 'lg:z-20', 'lg:flex', 'lg:translate-x-0'];
    expect(menu()).toHaveClass(...desktop);
    await openMenu();
    expect(menu()).toHaveClass(...desktop, 'lg:overflow-hidden');
    expect(menu()).not.toHaveClass('lg:z-auto');
  });
});
