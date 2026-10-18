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
  type DocumentsMockState,
} from '@/features/documents/api/handlers';
import { fakeAssignment } from '@/features/documents/api/fixtures';

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
  return document.querySelector<HTMLButtonElement>(
    'button[aria-controls="app-nav"]',
  )!;
}

function menu() {
  return document.getElementById('app-nav')!;
}

function mainColumn() {
  return screen.getByRole('main').parentElement!;
}

function expectClosed() {
  expect(menu()).toHaveClass('invisible', '-translate-x-full');
  expect(mainColumn()).not.toHaveClass('translate-x-64');
  expect(mainColumn()).not.toHaveClass('translate-x-0');
}

async function openMenu() {
  await userEvent.click(hamburger());
}

describe('AppShell mobile menu', () => {
  it('starts collapsed', () => {
    renderShell();
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expect(hamburger()).toHaveAccessibleName('Open menu');
    expectClosed();
    expect(document.body).not.toHaveClass('overflow-hidden');
  });

  it('slides in a drawer that pushes the page right and focuses the first link', async () => {
    renderShell();
    await openMenu();
    expect(hamburger()).toHaveAttribute('aria-expanded', 'true');
    expect(hamburger()).toHaveAccessibleName('Close menu');
    expect(menu()).toHaveClass('visible', 'translate-x-0', 'w-64');
    expect(menu()).not.toHaveClass('invisible', 'inset-0');
    expect(mainColumn()).toHaveClass('translate-x-64');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveFocus();
    expect(document.body).toHaveClass('overflow-hidden');
  });

  it('has no close button inside the drawer', async () => {
    renderShell();
    await openMenu();
    expect(
      within(menu()).queryByRole('button', { name: 'Close menu' }),
    ).toBeNull();
  });

  it('closes via the menu button and returns focus to it', async () => {
    renderShell();
    await openMenu();
    hamburger().focus();
    await userEvent.keyboard('{Enter}');
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expectClosed();
    expect(hamburger()).toHaveFocus();
    expect(document.body).not.toHaveClass('overflow-hidden');
  });

  it('closes when the pushed page is tapped', async () => {
    renderShell();
    await openMenu();
    await userEvent.click(screen.getByTestId('app-nav-backdrop'));
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expectClosed();
  });

  it('closes on Escape', async () => {
    renderShell();
    await openMenu();
    await userEvent.keyboard('{Escape}');
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expectClosed();
    expect(hamburger()).toHaveFocus();
  });

  it('closes when a nav link is clicked', async () => {
    renderShell();
    await openMenu();
    await userEvent.click(screen.getByRole('link', { name: 'Instructors' }));
    expect(screen.getByText('Instructors page')).toBeInTheDocument();
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expectClosed();
  });

  it('closes and releases the scroll lock when the route changes elsewhere', async () => {
    renderShell();
    await openMenu();
    act(() => navigate('/admin/instructors'));
    expect(screen.getByText('Instructors page')).toBeInTheDocument();
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
    expectClosed();
    expect(document.body).not.toHaveClass('overflow-hidden');
  });

  it('keeps the desktop sidebar classes whether or not the menu is open', async () => {
    renderShell();
    const desktop = [
      'lg:sticky',
      'lg:top-0',
      'lg:h-screen',
      'lg:z-20',
      'lg:visible',
      'lg:translate-x-0',
    ];
    expect(menu()).toHaveClass(...desktop);
    expect(mainColumn()).toHaveClass('lg:transform-none');
    await openMenu();
    expect(menu()).toHaveClass(...desktop);
    expect(mainColumn()).toHaveClass('lg:transform-none');
  });
});

describe('AppShell sidebar layout', () => {
  it('pins the sidebar to the viewport and keeps Sign out outside the scrolling nav', () => {
    renderShell();
    expect(menu()).toHaveClass('lg:sticky', 'lg:top-0', 'lg:h-screen');
    const nav = within(menu()).getByRole('navigation');
    expect(nav).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    const signOut = within(menu()).getByRole('button', { name: 'Sign out' });
    expect(nav).not.toContainElement(signOut);
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

  it('links to Lesson insurance right after Payroll', () => {
    renderShell();
    const links = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(
      screen.getByRole('link', { name: 'Lesson insurance' }),
    ).toHaveAttribute('href', '/admin/insurance');
    expect(links.indexOf('/admin/insurance')).toBe(
      links.indexOf('/admin/payroll') + 1,
    );
  });

  it('labels Lesson insurance in Chinese', () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderShell();
    expect(screen.getByRole('link', { name: '私课保险' })).toHaveAttribute(
      'href',
      '/admin/insurance',
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

const ONBOARDED: Partial<DocumentsMockState> = {
  assignments: [
    fakeAssignment({ templateId: 'tpl-handbook', status: 'completed' }),
  ],
  meCerts: [],
};

describe('AppShell instructor nav', () => {
  function renderInstructorShell(
    meApprovalStatus: 'approved' | 'pending' | 'rejected',
    overrides: Partial<DocumentsMockState> = ONBOARDED,
  ) {
    session.isAdmin = false;
    server.use(
      ...documentsHandlers(
        createDocumentsState({ meApprovalStatus, ...overrides }),
      ),
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
      '/insurance',
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

  it('locks Lesson insurance while pending or rejected', async () => {
    renderInstructorShell('pending');
    expect(
      await screen.findByRole('link', {
        name: 'Lesson insurance Locked until your profile is approved',
      }),
    ).toHaveAttribute('href', '/insurance');
  });

  it('keeps the insurance lock for a rejected instructor', async () => {
    renderInstructorShell('rejected');
    expect(
      await screen.findByRole('link', {
        name: 'Lesson insurance Locked until your profile is approved',
      }),
    ).toHaveAttribute('href', '/insurance');
  });

  it('shows a plain insurance link once approved, in Chinese too', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderInstructorShell('approved');
    const link = screen.getByRole('link', { name: '私课投保' });
    expect(link).toHaveAttribute('href', '/insurance');
    await waitFor(() => expect(link.querySelector('svg')).toBeNull());
  });

  it('locks Lessons & pay and insurance for an approved instructor until onboarding is complete', async () => {
    renderInstructorShell('approved', {});
    expect(
      await screen.findByRole('link', {
        name: 'Lessons & pay Locked until you finish onboarding',
      }),
    ).toHaveAttribute('href', '/lessons');
    expect(
      screen.getByRole('link', {
        name: 'Lesson insurance Locked until you finish onboarding',
      }),
    ).toHaveAttribute('href', '/insurance');
    expect(screen.getByRole('link', { name: 'Onboarding' })).toHaveAttribute(
      'href',
      '/onboarding',
    );
  });

  it('says why Lessons & pay and insurance are locked in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderInstructorShell('approved', {});
    expect(
      await screen.findByRole('link', {
        name: '课程与工资 完成入职资料后解锁',
      }),
    ).toHaveAttribute('href', '/lessons');
    expect(
      screen.getByRole('link', {
        name: '私课投保 完成入职资料后解锁',
      }),
    ).toHaveAttribute('href', '/insurance');
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
