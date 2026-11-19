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
import { ADMIN_REPORTS_ITEMS } from './adminNav';
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

function renderShell(route = '/admin') {
  return renderWithProviders(
    <>
      <CaptureNavigate />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<p>Dashboard page</p>} />
          <Route path="/admin/instructors" element={<p>Instructors page</p>} />
          <Route path="*" element={<p>Other admin page</p>} />
        </Route>
      </Routes>
    </>,
    { route },
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
    await userEvent.click(groupToggle('Instructors'));
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

const ADMIN_GROUPS: [string, [string, string][]][] = [
  [
    'Booking',
    [
      ['Book a lesson', '/admin/booking'],
      ['Classes', '/admin/classes'],
      ['Customers', '/admin/customers'],
      ['Lesson types', '/admin/lesson-types'],
      ['Import history', '/admin/import-history'],
    ],
  ],
  [
    'Instructors',
    [
      ['Instructors', '/admin/instructors'],
      ['Document review', '/admin/document-review'],
      ['Payroll', '/admin/payroll'],
      ['Lesson insurance', '/admin/insurance'],
    ],
  ],
  [
    'Documents',
    [
      ['Documents', '/admin/documents'],
      ['Signing forms', '/admin/signing-forms'],
      ['Signatures', '/admin/signatures'],
    ],
  ],
  [
    'Website',
    [
      ['Pages', '/admin/pages'],
      ['Shopify sync', '/admin/shopify-sync'],
    ],
  ],
  [
    'Settings',
    [
      ['Reference data', '/admin/reference'],
      ['Google Calendar', '/admin/settings/google'],
      ['API tokens', '/admin/settings/api-tokens'],
    ],
  ],
];

function expectedLinks(group: string) {
  return ADMIN_GROUPS.find(([name]) => name === group)?.[1];
}

function groupToggle(name: string) {
  return within(menu()).getByRole('button', { name });
}

function expandedGroups() {
  return within(menu())
    .getAllByRole('button', { expanded: true })
    .map((button) => button.textContent?.replace(/\d+$/, ''));
}

function linksIn(group: string) {
  return within(screen.getByRole('group', { name: group }))
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')]);
}

describe('AppShell admin nav', () => {
  it('shows Dashboard first, then the groups with Booking leading', () => {
    renderShell();
    const nav = within(menu()).getByRole('navigation');
    expect(within(nav).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(
      within(nav)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-controls')),
    ).toEqual([
      'admin-nav-booking',
      'admin-nav-instructors',
      'admin-nav-documents',
      'admin-nav-website',
      'admin-nav-settings',
    ]);
  });

  it('opens Booking and keeps the other groups collapsed on the dashboard', () => {
    renderShell();
    expect(expandedGroups()).toEqual(['Booking']);
    expect(linksIn('Booking')).toEqual(expectedLinks('Booking'));
    expect(screen.queryByRole('link', { name: 'Payroll' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'API tokens' })).toBeNull();
  });

  it('reaches every admin link through its group, in group order', async () => {
    renderShell();
    for (const [group, links] of ADMIN_GROUPS.slice(1)) {
      await userEvent.click(groupToggle(group));
      expect(groupToggle(group)).toHaveAttribute('aria-expanded', 'true');
      expect(linksIn(group)).toEqual(links);
    }
    expect(within(menu()).getAllByRole('link')).toHaveLength(18);
  });

  it('shows how many links each group holds', () => {
    renderShell();
    expect(groupToggle('Booking')).toHaveTextContent('Booking5');
    expect(groupToggle('Instructors')).toHaveTextContent('Instructors4');
    expect(groupToggle('Website')).toHaveTextContent('Website2');
  });

  it('collapses a group again from its header', async () => {
    renderShell();
    await userEvent.click(groupToggle('Booking'));
    expect(groupToggle('Booking')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Book a lesson' })).toBeNull();
  });

  it('expands the group holding the current page', () => {
    renderShell('/admin/signatures');
    expect(expandedGroups()).toEqual(['Booking', 'Documents']);
    expect(screen.getByRole('link', { name: 'Signatures' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('expands Instructors on an instructor detail page', () => {
    renderShell('/admin/instructors/abc');
    expect(groupToggle('Instructors')).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the group of a page reached from elsewhere, even after it was collapsed', async () => {
    localStorage.setItem(
      'ssms.adminNav.groups.v1',
      JSON.stringify({ settings: false }),
    );
    renderShell();
    act(() => navigate('/admin/settings/google'));
    expect(groupToggle('Settings')).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('link', { name: 'Google Calendar' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('toggles a group with Enter and Space and keeps focus on its header', async () => {
    renderShell();
    groupToggle('Website').focus();
    await userEvent.keyboard('{Enter}');
    expect(groupToggle('Website')).toHaveAttribute('aria-expanded', 'true');
    expect(groupToggle('Website')).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(groupToggle('Website')).toHaveAttribute('aria-expanded', 'false');
    expect(groupToggle('Website')).toHaveFocus();
  });

  it('remembers which groups were opened and closed in this browser', async () => {
    const { unmount } = renderShell();
    await userEvent.click(groupToggle('Booking'));
    await userEvent.click(groupToggle('Website'));
    unmount();
    renderShell();
    expect(expandedGroups()).toEqual(['Website']);
  });

  it('falls back to the default groups when the saved state is unreadable', () => {
    localStorage.setItem('ssms.adminNav.groups.v1', '{not json');
    renderShell();
    expect(expandedGroups()).toEqual(['Booking']);
  });

  it('shows the same groups in the mobile menu and keeps it open while toggling', async () => {
    renderShell();
    await openMenu();
    await userEvent.click(groupToggle('Documents'));
    expect(hamburger()).toHaveAttribute('aria-expanded', 'true');
    expect(linksIn('Documents')).toEqual(expectedLinks('Documents'));
    await userEvent.click(screen.getByRole('link', { name: 'Signing forms' }));
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('adds a Reports group last once it has a page', () => {
    ADMIN_REPORTS_ITEMS.push({ to: '/admin/bug-reports', label: 'dashboard' });
    try {
      renderShell('/admin/bug-reports');
      const toggles = within(menu()).getAllByRole('button', {
        expanded: true,
      });
      expect(toggles.at(-1)).toHaveAccessibleName('Reports');
      expect(
        within(screen.getByRole('group', { name: 'Reports' })).getByRole(
          'link',
        ),
      ).toHaveAttribute('href', '/admin/bug-reports');
    } finally {
      ADMIN_REPORTS_ITEMS.length = 0;
    }
  });

  it('names the groups in Chinese', () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderShell();
    expect(
      within(menu())
        .getAllByRole('button', { name: /./ })
        .filter((button) => button.hasAttribute('aria-controls'))
        .map((button) => button.textContent?.replace(/\d+$/, '')),
    ).toEqual(['预约', '教练', '文件与签署', '网站', '设置']);
  });

  it('labels Document review and Lesson insurance in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderShell();
    await userEvent.click(groupToggle('教练'));
    expect(screen.getByRole('link', { name: '资料审核' })).toHaveAttribute(
      'href',
      '/admin/document-review',
    );
    expect(screen.getByRole('link', { name: '私课保险' })).toHaveAttribute(
      'href',
      '/admin/insurance',
    );
  });

  it('does not link to Lesson products or Calendar matching', () => {
    renderShell();
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
      '/students',
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

  it('locks My students and waivers until the profile is approved', async () => {
    renderInstructorShell('pending');
    expect(
      await screen.findByRole('link', {
        name: 'My students and waivers Locked until your profile is approved',
      }),
    ).toHaveAttribute('href', '/students');
  });

  it('unlocks My students and waivers once approved, before onboarding is done', async () => {
    renderInstructorShell('approved', {});
    await screen.findByRole('link', {
      name: 'Lessons & pay Locked until you finish onboarding',
    });
    expect(
      screen.getByRole('link', { name: 'My students and waivers' }),
    ).toHaveAttribute('href', '/students');
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
