import { useState } from 'react';
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
        className={cn(
          'relative z-20 flex flex-col overflow-hidden bg-navy text-white',
          'lg:translate-x-0',
          open ? 'fixed inset-y-0 left-0 w-60' : 'hidden lg:flex',
        )}
      >
        <Contour className="pointer-events-none absolute inset-0 h-full w-full text-white" />
        <div className="relative flex items-center gap-2.5 px-5 py-5">
          <Brandmark size={32} />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/60">
            SSMS
          </span>
          <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
            {isAdmin ? t.nav.adminArea : t.nav.instructorArea}
          </span>
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

      {/* Backdrop for mobile drawer */}
      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 bg-ink/40 lg:hidden"
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-grey/60 bg-surface px-4 py-3 lg:px-8">
          <button
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-navy hover:bg-navy-tint lg:hidden"
            aria-label="Open menu"
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
