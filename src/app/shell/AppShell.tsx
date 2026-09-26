import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '@/auth/SessionProvider';
import { useT } from '@/i18n/core/I18nProvider';
import { Brandmark, Contour } from '@/components';
import { LangSwitch } from '@/components/LangSwitch';
import { cn } from '@/lib/cn';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

/** App shell (W1.7): navy contour sidebar + topbar; role-aware nav; responsive. */
export function AppShell() {
  const t = useT();
  const { isAdmin, user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
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
        { to: '/admin/reference', label: t.nav.reference },
      ]
    : [
        { to: '/profile', label: t.nav.profile },
        { to: '/settings', label: t.nav.settings },
      ];

  return (
    <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside
        id="app-nav"
        className={cn(
          'flex-col overflow-hidden bg-navy text-white lg:relative lg:flex',
          open
            ? 'fixed inset-0 z-50 flex overflow-y-auto lg:inset-auto lg:z-auto'
            : 'hidden',
        )}
      >
        <Contour className="pointer-events-none absolute inset-0 h-full w-full text-white" />
        <div className="relative flex items-center gap-2.5 px-5 py-5">
          <Brandmark height={20} pad={7} />
          <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
            {isAdmin ? t.nav.adminArea : t.nav.instructorArea}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t.nav.closeMenu}
            className="ml-auto rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <nav
          aria-label={isAdmin ? t.nav.adminArea : t.nav.instructorArea}
          className="relative flex flex-1 flex-col gap-1 px-3"
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
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="relative px-3 pb-5">
          <button
            onClick={signOut}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-white/70 hover:bg-white/5 hover:text-white"
          >
            {t.common.signOut}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-grey/60 bg-surface px-4 py-3 lg:px-8">
          <button
            ref={openButtonRef}
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-navy hover:bg-navy-tint lg:hidden"
            aria-label={t.nav.openMenu}
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
