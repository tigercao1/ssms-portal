import type { Messages } from '@/i18n/core/types';
import type { ChecklistProgress } from './queries';

export function progressText(
  { done, inReview, total }: ChecklistProgress,
  t: Messages,
): string {
  const template =
    inReview > 0 ? t.onboarding.progressInReview : t.onboarding.progress;
  return template
    .replace('{done}', String(done))
    .replace('{total}', String(total))
    .replace('{n}', String(inReview));
}

function percent(n: number, total: number): string {
  return `${total === 0 ? 0 : (n / total) * 100}%`;
}

/** Thin progress bar: done in navy, awaiting review in yellow. */
export function ProgressBar({
  progress: { done, inReview, total },
  label,
}: {
  progress: ChecklistProgress;
  label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="flex h-2 w-full overflow-hidden rounded-full bg-sunken"
    >
      <div
        className="h-full bg-navy transition-[width] duration-300"
        style={{ width: total === 0 ? '100%' : percent(done, total) }}
      />
      {inReview > 0 && (
        <div
          className="h-full bg-status-pending transition-[width] duration-300"
          style={{ width: percent(inReview, total) }}
        />
      )}
    </div>
  );
}
