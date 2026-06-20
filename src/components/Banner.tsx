import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'info' | 'pending' | 'approved' | 'rejected' | 'error';

const TONES: Record<Tone, string> = {
  info: 'border-l-navy bg-navy-tint text-navy',
  pending: 'border-l-status-pending bg-status-pending/10 text-ink',
  approved: 'border-l-status-approved bg-status-approved/10 text-ink',
  rejected: 'border-l-status-rejected bg-red-tint text-ink',
  error: 'border-l-status-rejected bg-red-tint text-ink',
};

/** Inline contextual banner with a 3px status rule (PORTAL_UI_PLAN.md). */
export function Banner({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border-l-[3px] px-4 py-3 text-sm', TONES[tone])}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-0.5' : undefined}>{children}</div>
    </div>
  );
}
