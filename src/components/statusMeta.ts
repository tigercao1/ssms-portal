import type { Messages } from '@/i18n/core/types';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface StatusMeta {
  label: string;
  /** CSS var color for the dot + left rule. */
  color: string;
  /** Tailwind text class. */
  textClass: string;
}

/**
 * Single source of truth for status visuals (W1.6) — color + label never drift.
 * `inactive` overrides an approved-but-deactivated instructor.
 */
export function statusMeta(
  status: ApprovalStatus,
  isActive: boolean,
  t: Messages,
): StatusMeta {
  if (status === 'approved' && !isActive) {
    return {
      label: t.status.inactive,
      color: 'var(--status-inactive)',
      textClass: 'text-status-inactive',
    };
  }
  switch (status) {
    case 'approved':
      return {
        label: t.status.approved,
        color: 'var(--status-approved)',
        textClass: 'text-status-approved',
      };
    case 'rejected':
      return {
        label: t.status.rejected,
        color: 'var(--status-rejected)',
        textClass: 'text-status-rejected',
      };
    case 'pending':
    default:
      return {
        label: t.status.pending,
        color: 'var(--status-pending)',
        textClass: 'text-status-pending',
      };
  }
}
