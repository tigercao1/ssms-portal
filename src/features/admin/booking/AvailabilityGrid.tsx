import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { localizeField } from '@/i18n/core/localize';
import { cn } from '@/lib/cn';
import { Banner, EmptyState } from '@/components';
import { formatSchoolTime, overlaps } from './bookingRules';
import type { Availability, UnavailableReason } from './types';

export interface SlotChoice {
  instructorId: string;
  startsAt: string;
}

const REASON_KEYS: Record<UnavailableReason, keyof Messages['booking']> = {
  inactive: 'reasonInactive',
  no_calendar: 'reasonNoCalendar',
  calendar_not_confirmed: 'reasonNotConfirmed',
  calendar_not_writable: 'reasonNotWritable',
  calendar_error: 'reasonCalendarError',
  google_not_connected: 'reasonGoogleNotConnected',
  google_unavailable: 'reasonGoogleUnavailable',
};

export function AvailabilityGrid({
  availability,
  selected,
  onSelect,
}: {
  availability: Availability;
  selected: SlotChoice | null;
  onSelect: (choice: SlotChoice) => void;
}) {
  const t = useT();
  const { locale } = useLocale();

  if (!availability.window) {
    return <Banner tone="info">{t.booking.dayClosed}</Banner>;
  }

  return (
    <div className="flex flex-col gap-4">
      {availability.instructors.length === 0 ? (
        <EmptyState title={t.booking.noInstructorsTitle}>
          {t.booking.noInstructorsBody}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border border-grey/60">
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
            <caption className="sr-only">{t.booking.gridCaption}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 min-w-[8rem] border-b border-grey/60 bg-surface px-3 py-2 text-left font-medium text-slate"
                >
                  {t.booking.instructorCol}
                </th>
                {availability.slots.map((slot) => {
                  const time = formatSchoolTime(slot, locale);
                  return (
                    <th
                      key={slot}
                      scope="col"
                      className="w-8 border-b border-grey/60 px-0 py-2 text-left font-mono text-[10px] font-normal text-slate"
                    >
                      {time.endsWith(':00') ? (
                        time
                      ) : (
                        <span className="sr-only">{time}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {availability.instructors.map((row) => {
                const name =
                  localizeField(row.displayNameEn, row.displayNameZh, locale) ||
                  row.displayNameEn;
                const free = new Set(row.freeSlots);
                return (
                  <tr key={row.instructorId}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-grey/40 bg-surface px-3 py-1.5 text-left text-sm font-medium text-ink"
                    >
                      {name}
                    </th>
                    {availability.slots.map((slot) => {
                      const busy = row.busy.some((b) =>
                        overlaps(slot, availability.slotMinutes, b),
                      );
                      const isSelected =
                        selected?.instructorId === row.instructorId &&
                        selected.startsAt === slot;
                      const time = formatSchoolTime(slot, locale);
                      return (
                        <td
                          key={slot}
                          className="border-b border-grey/40 p-0.5"
                        >
                          {free.has(slot) ? (
                            <button
                              type="button"
                              aria-pressed={isSelected}
                              aria-label={t.booking.slotLabel
                                .replace('{name}', name)
                                .replace('{time}', time)}
                              onClick={() =>
                                onSelect({
                                  instructorId: row.instructorId,
                                  startsAt: slot,
                                })
                              }
                              className={cn(
                                'block h-8 w-7 rounded-sm transition-colors',
                                isSelected
                                  ? 'bg-navy text-white'
                                  : 'bg-[color-mix(in_srgb,var(--status-approved)_18%,white)] hover:bg-[color-mix(in_srgb,var(--status-approved)_40%,white)]',
                              )}
                            />
                          ) : (
                            <span
                              title={busy ? t.booking.busy : undefined}
                              aria-label={busy ? t.booking.busy : undefined}
                              className={cn(
                                'block h-8 w-7 rounded-sm',
                                busy
                                  ? 'bg-grey bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(255,255,255,0.35)_4px,rgba(255,255,255,0.35)_8px)]'
                                  : 'bg-sunken',
                              )}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-slate">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm bg-[color-mix(in_srgb,var(--status-approved)_18%,white)]" />
          {t.booking.legendFree}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm bg-grey" />
          {t.booking.legendBusy}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm bg-sunken" />
          {t.booking.legendNoFit}
        </span>
      </div>

      {availability.unavailable.length > 0 && (
        <section
          aria-label={t.booking.unavailableTitle}
          className="flex flex-col gap-2"
        >
          <h3 className="text-sm font-medium text-navy">
            {t.booking.unavailableTitle}
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {availability.unavailable.map((u) => (
              <li key={u.instructorId} className="text-ink">
                {localizeField(u.displayNameEn, u.displayNameZh, locale) ||
                  u.displayNameEn}{' '}
                <span className="text-slate">
                  · {t.booking[REASON_KEYS[u.reason]]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
