import type { ReactNode } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import type { ApprovalLockReason, InstructorLockReason } from '@/lib/types';

export type StatusReason = InstructorLockReason | 'approved';

export interface SurfaceReasons {
  onboarding: ApprovalLockReason;
  insurance: InstructorLockReason;
  lessons: InstructorLockReason;
  profile: ApprovalLockReason | 'approved';
}

export type StatusSurface = keyof SurfaceReasons;

type Messages = ReturnType<typeof useT>;
type Copy = readonly [title: string | null, body: string];

const COPY: {
  [S in StatusSurface]: (t: Messages) => Record<SurfaceReasons[S], Copy>;
} = {
  onboarding: (t) => ({
    pending_approval: [t.onboarding.lockedTitle, t.onboarding.lockedBody],
    rejected: [t.onboarding.rejectedTitle, t.onboarding.rejectedBody],
    deactivated: [t.onboarding.deactivatedTitle, t.onboarding.deactivatedBody],
  }),
  insurance: (t) => ({
    pending_approval: [t.insurance.pendingTitle, t.insurance.pendingBody],
    rejected: [t.insurance.rejectedTitle, t.insurance.rejectedBody],
    deactivated: [t.insurance.deactivatedTitle, t.insurance.deactivatedBody],
    onboarding_incomplete: [
      t.insurance.onboardingTitle,
      t.insurance.onboardingBody,
    ],
  }),
  lessons: (t) => ({
    pending_approval: [t.myLessons.pendingTitle, t.myLessons.pendingBody],
    rejected: [t.myLessons.rejectedTitle, t.myLessons.rejectedBody],
    deactivated: [t.myLessons.deactivatedTitle, t.myLessons.deactivatedBody],
    onboarding_incomplete: [
      t.myLessons.onboardingTitle,
      t.myLessons.onboardingBody,
    ],
  }),
  profile: (t) => ({
    pending_approval: [null, t.profile.pendingBanner],
    approved: [null, t.profile.approvedBanner],
    rejected: [null, t.profile.rejectedBanner],
    deactivated: [null, t.profile.inactiveBanner],
  }),
};

export function statusCopy<S extends StatusSurface>(
  surface: S,
  reason: SurfaceReasons[S],
  t: Messages,
): Copy {
  return COPY[surface](t)[reason];
}

const TONES: Record<StatusReason, { border: string; icon: string }> = {
  pending_approval: {
    border: 'border-l-status-pending',
    icon: 'text-status-pending',
  },
  rejected: {
    border: 'border-l-status-rejected',
    icon: 'text-status-rejected',
  },
  deactivated: {
    border: 'border-l-status-inactive',
    icon: 'text-status-inactive',
  },
  onboarding_incomplete: { border: 'border-l-navy', icon: 'text-navy' },
  approved: {
    border: 'border-l-status-approved',
    icon: 'text-status-approved',
  },
};

function Glyph({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-3.5 w-3.5', className)}
    >
      {children}
    </svg>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Glyph>
  );
}

const GLYPHS: Record<StatusReason, ReactNode> = {
  pending_approval: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  rejected: <path d="M6 6l12 12M18 6L6 18" />,
  deactivated: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  onboarding_incomplete: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </>
  ),
  approved: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

export function StatusIcon({
  reason,
  className,
}: {
  reason: StatusReason;
  className?: string;
}) {
  return (
    <Glyph className={cn(TONES[reason].icon, className)}>
      {GLYPHS[reason]}
    </Glyph>
  );
}

export function StatusBanner<S extends StatusSurface>({
  surface,
  reason,
}: {
  surface: S;
  reason: SurfaceReasons[S];
}) {
  const t = useT();
  const [title, body] = statusCopy(surface, reason, t);
  return (
    <div
      role="status"
      className={cn(
        'flex gap-3 rounded-md border-l-[3px] bg-surface px-4 py-3 text-sm shadow-card',
        title ? 'items-start' : 'items-center',
        TONES[reason].border,
      )}
    >
      <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-sunken">
        <StatusIcon reason={reason} />
      </span>
      <div>
        {title && <p className="font-semibold text-navy">{title}</p>}
        <p className="text-ink">{body}</p>
      </div>
    </div>
  );
}
