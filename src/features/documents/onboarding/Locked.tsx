import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { certificationLabel } from '@/features/instructor/certLabels';
import type { ChecklistItem } from '../api';

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

/** True when the API refused because the instructor is not approved yet. */
export function isPendingApprovalError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    (error.body as { reason?: unknown } | undefined)?.reason ===
      'pending_approval'
  );
}

/** "Your profile is being reviewed" banner for locked onboarding pages. */
export function LockedBanner() {
  const t = useT();
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border-l-[3px] border-l-status-pending bg-surface px-4 py-3 text-sm shadow-card"
    >
      <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-sunken text-status-pending">
        <LockIcon />
      </span>
      <div>
        <p className="font-semibold text-navy">{t.onboarding.lockedTitle}</p>
        <p className="text-ink">{t.onboarding.lockedBody}</p>
      </div>
    </div>
  );
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
