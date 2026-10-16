import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { certificationLabel } from '@/features/instructor/certLabels';
import type { ChecklistItem, ChecklistLockReason } from '../api';

/** Padlock glyph used wherever onboarding is locked. */
export function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      className={cn('h-3.5 w-3.5', className)}
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

const LOCK_STYLES: Record<
  ChecklistLockReason,
  { border: string; icon: string }
> = {
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
};

/** The lock reason when the API refused because the instructor is not approved or is deactivated. */
export function lockReasonOf(error: unknown): ChecklistLockReason | null {
  if (!(error instanceof ApiError) || error.status !== 403) return null;
  const reason = (error.body as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' && Object.hasOwn(LOCK_STYLES, reason)
    ? (reason as ChecklistLockReason)
    : null;
}

/** Banner for locked onboarding pages: under review, not approved, or deactivated. */
export function LockedBanner({ reason }: { reason: ChecklistLockReason }) {
  const t = useT();
  const style = LOCK_STYLES[reason];
  const [title, body] = lockText(reason, t);
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-md border-l-[3px] bg-surface px-4 py-3 text-sm shadow-card',
        style.border,
      )}
    >
      <span
        className={cn(
          'grid h-7 w-7 flex-none place-items-center rounded-full bg-sunken',
          style.icon,
        )}
      >
        <LockIcon />
      </span>
      <div>
        <p className="font-semibold text-navy">{title}</p>
        <p className="text-ink">{body}</p>
      </div>
    </div>
  );
}

export function lockText(
  reason: ChecklistLockReason,
  t: ReturnType<typeof useT>,
): [title: string, body: string] {
  switch (reason) {
    case 'rejected':
      return [t.onboarding.rejectedTitle, t.onboarding.rejectedBody];
    case 'deactivated':
      return [t.onboarding.deactivatedTitle, t.onboarding.deactivatedBody];
    default:
      return [t.onboarding.lockedTitle, t.onboarding.lockedBody];
  }
}

/** Greyed, non-interactive rows previewing what unlocks on approval. */
export function LockedPreviewList({ items }: { items: ChecklistItem[] }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <ul aria-label={t.onboarding.title} className="flex flex-col gap-2">
      {items.map((item) => {
        const [key, title, tag] =
          item.type === 'document'
            ? [
                item.templateId,
                localizeField(item.titleEn, item.titleZh, locale),
                item.kind === 'read'
                  ? t.onboarding.kindRead
                  : t.onboarding.kindSign,
              ]
            : [
                `${item.org}:${item.track}`,
                certificationLabel({ ...item, isPartial: false }, t),
                t.onboarding.tagUpload,
              ];
        return (
          <li
            key={key}
            aria-disabled="true"
            className="flex items-center justify-between gap-3 rounded-md border border-dashed border-grey bg-sunken px-4 py-3 text-sm text-slate"
          >
            <span>{title}</span>
            <span className="flex-none rounded-sm bg-surface px-2 py-0.5 text-xs">
              {tag}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Pending instructor with nothing published yet. */
export function LockedEmpty() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-surface px-5 py-8 text-center shadow-card">
      <span
        aria-hidden
        className="grid h-12 w-12 place-items-center rounded-full bg-sunken text-2xl"
      >
        ⏳
      </span>
      <h2 className="text-xl">{t.onboarding.lockedEmptyTitle}</h2>
      <p className="text-sm text-slate">{t.onboarding.lockedEmptyBody}</p>
    </div>
  );
}
