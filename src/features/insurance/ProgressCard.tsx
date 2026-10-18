import { Card } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { dollars, fill } from './money';
import type { MyInsurance } from './types';

export function ProgressCard({
  data,
  draftCents = null,
}: {
  data: Pick<
    MyInsurance,
    'owedCents' | 'capCents' | 'coverage' | 'unpaidCents'
  >;
  draftCents?: number | null;
}) {
  const t = useT();
  const s = t.insurance;
  const { owedCents, capCents } = data;
  const seasonPass = data.coverage === 'season_pass';
  const capped = seasonPass || owedCents >= capCents;
  const ghost = capped ? 0 : (draftCents ?? 0);
  const pct = (cents: number) =>
    `${(Math.min(cents, capCents) / capCents) * 100}%`;
  return (
    <Card className="flex flex-col gap-2 p-4 sm:p-5">
      <div
        data-testid="progress"
        className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1"
      >
        <span
          data-testid="cap-total"
          className="font-display text-xl font-semibold text-navy"
        >
          {fill(s.progressTotal, {
            amount: dollars(owedCents),
            cap: dollars(capCents),
          })}
        </span>
        {draftCents !== null && !capped && (
          <span
            data-testid="draft-preview"
            className="text-[13px] font-semibold text-red"
          >
            {fill(s.progressDraft, {
              amount: dollars(ghost),
              total: dollars(Math.min(owedCents + ghost, capCents)),
            })}
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={s.progressLabel}
        aria-valuemin={0}
        aria-valuemax={capCents / 100}
        aria-valuenow={Math.min(owedCents, capCents) / 100}
        className="flex h-2.5 overflow-hidden rounded-full bg-sunken shadow-[inset_0_0_0_1px_var(--grey)]"
      >
        <span
          className="block h-full bg-navy transition-[width]"
          style={{ width: pct(owedCents) }}
        />
        {ghost > 0 && (
          <span
            data-testid="draft-ghost"
            className="block h-full bg-[repeating-linear-gradient(45deg,var(--red)_0_4px,var(--red-tint)_4px_8px)]"
            style={{ width: pct(ghost) }}
          />
        )}
      </div>
      <p
        data-testid="cap-status"
        className={cn(
          'text-sm',
          capped ? 'font-semibold text-status-approved' : 'text-ink',
        )}
      >
        {seasonPass
          ? s.progressSeasonPass
          : capped
            ? s.progressCapped
            : fill(s.progressRemaining, {
                amount: dollars(capCents - owedCents),
              })}
      </p>
      {!capped && ghost > 0 && owedCents + ghost >= capCents && (
        <p className="text-[13px] font-semibold text-status-approved">
          {s.progressReach}
        </p>
      )}
      {data.unpaidCents > 0 && (
        <p className="text-xs text-status-pending">
          {fill(s.progressUnpaid, { amount: dollars(data.unpaidCents) })}
        </p>
      )}
    </Card>
  );
}
