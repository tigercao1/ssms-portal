import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Route,
  Routes,
  useNavigate,
  type NavigateFunction,
} from 'react-router-dom';
import { AppShell } from './AppShell';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw';
import {
  createDocumentsState,
  documentsHandlers,
} from '@/features/documents/api/handlers';

const session = vi.hoisted(() => ({ isAdmin: true }));

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({
    isAdmin: session.isAdmin,
    user: { email: 'admin@example.com' },
    signOut: vi.fn(),
  }),
}));

beforeEach(() => {
  session.isAdmin = true;
});

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

describe('AppShell admin nav', () => {
  it('links to the Shopify sync page', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Shopify sync' })).toHaveAttribute(
      'href',
      '/admin/shopify-sync',
    );
  });

  it('links to the Google Calendar settings page', () => {
    renderShell();
    expect(
      screen.getByRole('link', { name: 'Google Calendar' }),
    ).toHaveAttribute('href', '/admin/settings/google');
  });

  it('links to Pages after Reference data', () => {
    renderShell();
    const links = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(screen.getByRole('link', { name: 'Pages' })).toHaveAttribute(
      'href',
      '/admin/pages',
    );
    expect(links.indexOf('/admin/pages')).toBe(
      links.indexOf('/admin/reference') + 1,
    );
  });

  it('links to Lesson types, Customers and Classes, not Calendar matching', () => {
    renderShell();
    for (const [name, href] of [
      ['Lesson types', '/admin/lesson-types'],
      ['Customers', '/admin/customers'],
      ['Classes', '/admin/classes'],
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(
      screen.queryByRole('link', { name: 'Lesson products' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Calendar matching' }),
    ).not.toBeInTheDocument();
  });
});

describe('AppShell instructor nav', () => {
  function renderInstructorShell(
    meApprovalStatus: 'approved' | 'pending' | 'rejected',
  ) {
    session.isAdmin = false;
    server.use(
      ...documentsHandlers(createDocumentsState({ meApprovalStatus })),
    );
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/profile" element={<p>Profile page</p>} />
        </Route>
      </Routes>,
      { route: '/profile' },
    );
  }

  it('shows a lock on Onboarding while the profile is pending approval', async () => {
    renderInstructorShell('pending');
    expect(
      await screen.findByRole('link', {
        name: 'Onboarding Locked until your profile is approved',
      }),
    ).toHaveAttribute('href', '/onboarding');
  });

  it('keeps the lock on Onboarding for a rejected instructor', async () => {
    renderInstructorShell('rejected');
    expect(
      await screen.findByRole('link', {
        name: 'Onboarding Locked until your profile is approved',
      }),
    ).toBeInTheDocument();
  });

  it('lists Lessons & pay right after Onboarding', async () => {
    renderInstructorShell('approved');
    const links = within(
      screen.getByRole('navigation', { name: 'Instructor' }),
    ).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/profile',
      '/onboarding',
      '/lessons',
      '/settings',
    ]);
    const lessons = screen.getByRole('link', { name: 'Lessons & pay' });
    await waitFor(() => expect(lessons.querySelector('svg')).toBeNull());
  });

  it('locks Lessons & pay while the profile is pending approval', async () => {
    renderInstructorShell('pending');
    expect(
      await screen.findByRole('link', {
        name: 'Lessons & pay Locked until your profile is approved',
      }),
    ).toHaveAttribute('href', '/lessons');
  });

  it('shows Lessons & pay without a lock for a rejected instructor', async () => {
    renderInstructorShell('rejected');
    await screen.findByRole('link', {
      name: 'Onboarding Locked until your profile is approved',
    });
    const lessons = screen.getByRole('link', { name: 'Lessons & pay' });
    expect(lessons).toHaveAttribute('href', '/lessons');
    expect(lessons.querySelector('svg')).toBeNull();
  });

  it('labels Lessons & pay in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderInstructorShell('approved');
    expect(screen.getByRole('link', { name: '课程与工资' })).toHaveAttribute(
      'href',
      '/lessons',
    );
  });

  it('shows a plain Onboarding link once approved', async () => {
    renderInstructorShell('approved');
    const link = screen.getByRole('link', { name: 'Onboarding' });
    await waitFor(() => expect(link.querySelector('svg')).toBeNull());
    expect(
      screen.queryByText('Locked until your profile is approved'),
    ).not.toBeInTheDocument();
  });
});
