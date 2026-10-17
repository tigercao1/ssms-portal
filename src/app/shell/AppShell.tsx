import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '@/auth/SessionProvider';
import { useT } from '@/i18n/core/I18nProvider';
import { Brandmark, Contour } from '@/components';
import { LangSwitch } from '@/components/LangSwitch';
import { cn } from '@/lib/cn';
import { useMyChecklist } from '@/features/documents/onboarding/queries';
import { LockIcon } from '@/features/documents/onboarding/Locked';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  locked?: boolean;
}

/** App shell (W1.7): navy contour sidebar + topbar; role-aware nav; responsive. */
export function AppShell() {
  const t = useT();
  const { isAdmin, user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const { pathname } = useLocation();
  const checklist = useMyChecklist({ enabled: !isAdmin });

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      navRef.current?.querySelector('a')?.focus();
    } else if (wasOpen.current) {
      openButtonRef.current?.focus();
    }
    wasOpen.current = open;
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('overflow-hidden', 'lg:overflow-auto');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('overflow-hidden', 'lg:overflow-auto');
    };
  }, [open]);

  const items: NavItem[] = isAdmin
    ? [
        { to: '/admin', label: t.nav.dashboard, end: true },
        { to: '/admin/instructors', label: t.nav.instructors },
        { to: '/admin/documents', label: t.nav.documents },
        { to: '/admin/reference', label: t.nav.reference },
        { to: '/admin/pages', label: t.nav.pages },
        { to: '/admin/shopify-sync', label: t.nav.shopifySync },
        { to: '/admin/lesson-types', label: t.nav.lessonTypes },
        { to: '/admin/customers', label: t.nav.customers },
        { to: '/admin/booking', label: t.nav.booking },
        { to: '/admin/classes', label: t.nav.classes },
        { to: '/admin/payroll', label: t.nav.payroll },
        { to: '/admin/insurance', label: t.nav.adminInsurance },
        { to: '/admin/import-history', label: t.nav.importHistory },
        { to: '/admin/settings/google', label: t.nav.google },
      ]
    : [
        { to: '/profile', label: t.nav.profile },
        {
          to: '/onboarding',
          label: t.nav.onboarding,
          locked: checklist.data?.locked ?? false,
        },
        {
          to: '/insurance',
          label: t.nav.insurance,
          locked: checklist.data?.locked ?? false,
        },
        {
          to: '/lessons',
          label: t.nav.lessonsPay,
          locked: checklist.data?.lockReason === 'pending_approval',
        },
        { to: '/settings', label: t.nav.settings },
      ];

  return (
    <div className="grid min-h-screen overflow-x-clip lg:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside
        id="app-nav"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-hidden bg-navy text-white',
          'duration-300 ease-out motion-reduce:transition-none',
          'lg:sticky lg:bottom-auto lg:top-0 lg:z-20 lg:h-screen lg:w-auto lg:visible lg:translate-x-0 lg:transition-none',
          open
            ? 'visible translate-x-0 transition-transform'
            : 'invisible -translate-x-full transition-[transform,visibility]',
        )}
      >
        <Contour className="pointer-events-none absolute inset-0 h-full w-full text-white" />
        <div className="relative flex items-center gap-2.5 px-5 py-5">
          <Brandmark height={20} pad={7} />
          <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
            {isAdmin ? t.nav.adminArea : t.nav.instructorArea}
          </span>
        </div>
        <nav
          ref={navRef}
          aria-label={isAdmin ? t.nav.adminArea : t.nav.instructorArea}
          className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3"
        >
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  'border-l-[3px] border-transparent',
                  isActive
                    ? 'border-l-red bg-white/10 font-medium text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {it.locked ? (
                <span
                  className="inline-flex items-center gap-2"
                  title={t.nav.onboardingLocked}
                >
                  <LockIcon />
                  {it.label}{' '}
                  <span className="sr-only">{t.nav.onboardingLocked}</span>
                </span>
              ) : (
                it.label
              )}
            </NavLink>
          ))}
        </nav>
        <div className="relative shrink-0 px-3 pb-5 pt-2">
          <button
            onClick={signOut}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-white/70 hover:bg-white/5 hover:text-white"
          >
            {t.common.signOut}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div
        className={cn(
          'relative flex min-w-0 flex-col',
          'transition-transform duration-300 ease-out motion-reduce:transition-none lg:translate-x-0 lg:transition-none',
          open ? 'translate-x-64' : 'translate-x-0',
        )}
      >
        <div
          data-testid="app-nav-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className={cn(
            'absolute inset-0 z-30 bg-navy/20 transition-opacity duration-300 motion-reduce:transition-none lg:hidden',
            open ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        />
        <header className="flex items-center justify-between border-b border-grey/60 bg-surface px-4 py-3 lg:px-8">
          <button
            ref={openButtonRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-md p-2 text-navy hover:bg-navy-tint lg:hidden"
            aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
            aria-expanded={open}
            aria-controls="app-nav"
          >
            <span className="block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
            <span className="mt-1 block h-0.5 w-5 bg-current" />
          </button>
          <div className="ml-auto flex items-center gap-4">
            <LangSwitch />
            {user?.email && (
              <span className="hidden font-mono text-xs text-slate sm:inline">
                {user.email}
              </span>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
