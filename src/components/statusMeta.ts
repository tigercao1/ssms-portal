import type { Messages } from '@/i18n/core/types';
import { INSTRUCTOR_STAGES, type InstructorStage } from '@/lib/types';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export { INSTRUCTOR_STAGES, type InstructorStage };

export interface StatusMeta {
  label: string;
  /** CSS var color for the dot + left rule. */
  color: string;
  /** Tailwind text class. */
  textClass: string;
}

const INACTIVE_META = (t: Messages): StatusMeta => ({
  label: t.status.inactive,
  color: 'var(--status-inactive)',
  textClass: 'text-status-inactive',
});

/**
 * Single source of truth for status visuals (W1.6) — color + label never drift.
 * `inactive` overrides any deactivated instructor, whatever their approval status.
 */
export function statusMeta(
  status: ApprovalStatus,
  isActive: boolean,
  t: Messages,
): StatusMeta {
  if (!isActive) return INACTIVE_META(t);
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

export function stageMeta(stage: InstructorStage, t: Messages): StatusMeta {
  switch (stage) {
    case 'pending':
      return statusMeta('pending', true, t);
    case 'rejected':
      return statusMeta('rejected', true, t);
    case 'deactivated':
      return INACTIVE_META(t);
    case 'onboarding':
      return {
        label: t.status.onboarding,
        color: 'var(--status-pending)',
        textClass: 'text-status-pending',
      };
    case 'in_review':
      return {
        label: t.status.inReview,
        color: 'var(--status-pending)',
        textClass: 'text-status-pending',
      };
    case 'going_live':
      return {
        label: t.status.goingLive,
        color: 'var(--navy)',
        textClass: 'text-navy',
      };
    case 'live':
      return {
        label: t.status.live,
        color: 'var(--status-live)',
        textClass: 'text-status-live-ink',
      };
  }
}
