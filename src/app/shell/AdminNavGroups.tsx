import { useEffect, useLayoutEffect, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { SidebarLink } from './SidebarLink';
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_STORAGE_KEY,
  type AdminNavGroup,
} from './adminNav';

type OpenGroups = Record<string, boolean>;

function readOpenGroups(): OpenGroups {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(ADMIN_NAV_STORAGE_KEY) ?? '{}',
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
      ),
    );
  } catch {
    return {};
  }
}

function writeOpenGroups(open: OpenGroups) {
  try {
    window.localStorage.setItem(ADMIN_NAV_STORAGE_KEY, JSON.stringify(open));
  } catch {
    return;
  }
}

function containsPath(group: AdminNavGroup, pathname: string) {
  return group.items.some((item) =>
    matchPath({ path: item.to, end: item.end ?? false }, pathname),
  );
}

function isOpen(open: OpenGroups, group: AdminNavGroup) {
  return open[group.id] ?? group.defaultOpen ?? false;
}

export function AdminNavGroups({ onNavigate }: { onNavigate: () => void }) {
  const t = useT();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(readOpenGroups);
  const groups = ADMIN_NAV_GROUPS.filter((group) => group.items.length > 0);
  const activeGroup = groups.find((group) => containsPath(group, pathname));

  useLayoutEffect(() => {
    if (activeGroup && !isOpen(open, activeGroup))
      setOpen((prev) => ({ ...prev, [activeGroup.id]: true }));
  }, [pathname]);

  useEffect(() => {
    writeOpenGroups(open);
  }, [open]);

  return (
    <>
      {groups.map((group) => {
        const expanded = isOpen(open, group);
        const buttonId = `admin-nav-${group.id}-toggle`;
        const listId = `admin-nav-${group.id}`;
        return (
          <div key={group.id} className="mt-3 flex flex-col gap-1">
            <button
              type="button"
              id={buttonId}
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() =>
                setOpen((prev) => ({ ...prev, [group.id]: !expanded }))
              }
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-white/55 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={cn(
                  'h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none',
                  expanded && 'rotate-90',
                )}
              >
                <path d="M7 4l6 6-6 6V4z" />
              </svg>
              <span className="flex-1">{t.nav[group.heading]}</span>
              <span
                aria-hidden="true"
                className="rounded-sm bg-white/10 px-1.5 text-[10px] tabular-nums text-white/60"
              >
                {group.items.length}
              </span>
            </button>
            <div
              id={listId}
              role="group"
              aria-labelledby={buttonId}
              hidden={!expanded}
              className={cn('flex-col gap-1', expanded && 'flex')}
            >
              {group.items.map((item) => (
                <SidebarLink
                  key={item.to}
                  item={{
                    to: item.to,
                    label: t.nav[item.label],
                    end: item.end,
                  }}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
