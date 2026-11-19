import { NavLink } from 'react-router-dom';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { LockIcon } from '@/features/documents/onboarding/Locked';

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  locked?: boolean;
  lockedLabel?: string;
}

export function SidebarLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  const t = useT();
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
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
      {item.locked ? (
        <span
          className="inline-flex items-center gap-2"
          title={item.lockedLabel ?? t.nav.onboardingLocked}
        >
          <LockIcon />
          {item.label}{' '}
          <span className="sr-only">
            {item.lockedLabel ?? t.nav.onboardingLocked}
          </span>
        </span>
      ) : (
        item.label
      )}
    </NavLink>
  );
}
