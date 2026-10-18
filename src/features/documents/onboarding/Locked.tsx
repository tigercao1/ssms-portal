import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { ApiError } from '@/lib/api';
import { certificationLabel } from '@/features/instructor/certLabels';
import type { ChecklistItem, ChecklistLockReason } from '../api';

const LOCK_REASONS: readonly ChecklistLockReason[] = [
  'pending_approval',
  'rejected',
  'deactivated',
];

/** The lock reason when the API refused because the instructor is not approved or is deactivated. */
export function lockReasonOf(error: unknown): ChecklistLockReason | null {
  if (!(error instanceof ApiError) || error.status !== 403) return null;
  const reason = (error.body as { reason?: unknown } | undefined)?.reason;
  return LOCK_REASONS.find((r) => r === reason) ?? null;
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
