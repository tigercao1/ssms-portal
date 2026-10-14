import { useState } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Locale, Messages } from '@/i18n/core/types';
import { localizeField } from '@/i18n/core/localize';
import { cn } from '@/lib/cn';
import { Banner, EmptyState, Field, Input } from '@/components';
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

const FREE_CELL = 'bg-[color-mix(in_srgb,var(--status-approved)_18%,white)]';
const BUSY_CELL =
  'bg-grey bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(255,255,255,0.35)_4px,rgba(255,255,255,0.35)_8px)]';

function startableSlots(availability: Availability): string[] {
  const last = availability.slots[availability.slots.length - 1];
  if (!last) return [];
  const windowEnd = Date.parse(last) + availability.slotMinutes * 60_000;
  return availability.slots.filter(
    (slot) => Date.parse(slot) + availability.durationMin * 60_000 <= windowEnd,
  );
}

function hourGroups(slots: string[], locale: Locale) {
  const groups: {
    first: string;
    label: string;
    onHour: boolean;
    span: number;
  }[] = [];
  for (const slot of slots) {
    const time = formatSchoolTime(slot, locale);
    const current = groups[groups.length - 1];
    if (current && !time.endsWith(':00')) {
      current.span += 1;
    } else {
      groups.push({
        first: slot,
        label: time,
        onHour: time.endsWith(':00'),
        span: 1,
      });
    }
  }
  return groups;
}

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
  const [query, setQuery] = useState('');

  if (!availability.window) {
    return <Banner tone="info">{t.booking.dayClosed}</Banner>;
  }

  const needle = query.trim().toLocaleLowerCase();
  const matches = (row: {
    displayNameEn: string;
    displayNameZh: string | null;
  }) =>
    !needle ||
    [row.displayNameEn, row.displayNameZh].some((n) =>
      n?.toLocaleLowerCase().includes(needle),
    );
  const instructors = availability.instructors.filter(matches);
  const unavailable = availability.unavailable.filter(matches);
  const slots = startableSlots(availability);
  const hours = hourGroups(slots, locale);
  const hourStarts = new Set(hours.slice(1).map((h) => h.first));

  return (
    <div className="flex flex-col gap-4">
      {availability.instructors.length + availability.unavailable.length >
        0 && (
        <div className="sm:w-[calc(50%-0.5rem)]">
          <Field label={t.booking.instructorSearch}>
            {(p) => (
              <Input
                {...p}
                type="search"
                value={query}
                placeholder={t.booking.instructorSearchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
          </Field>
        </div>
      )}
      {availability.instructors.length === 0 ? (
        <EmptyState title={t.booking.noInstructorsTitle}>
          {t.booking.noInstructorsBody}
        </EmptyState>
      ) : instructors.length === 0 ? (
        <p className="text-sm text-slate">
          {t.booking.instructorSearchEmpty.replace('{q}', query.trim())}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-grey/60">
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
            <caption className="sr-only">{t.booking.gridCaption}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 min-w-[8rem] border-b border-r border-grey/60 bg-surface px-3 py-2 text-left font-medium text-slate"
                >
                  {t.booking.instructorCol}
                </th>
                {hours.map((hour, index) => (
                  <th
                    key={hour.first}
                    scope="col"
                    colSpan={hour.span}
                    className={cn(
                      'border-b border-grey/60 py-2 pl-0.5 text-left font-mono text-[11px] font-normal text-slate',
                      index > 0 && 'border-l',
                    )}
                  >
                    {hour.onHour ? (
                      hour.label
                    ) : (
                      <span className="sr-only">{hour.label}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instructors.map((row) => {
                const name =
                  localizeField(row.displayNameEn, row.displayNameZh, locale) ||
                  row.displayNameEn;
                const free = new Set(row.freeSlots);
                return (
                  <tr key={row.instructorId}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-grey/60 bg-surface px-3 py-1.5 text-left text-sm font-medium text-ink"
                    >
                      {name}
                    </th>
                    {slots.map((slot) => {
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
                          className={cn(
                            'w-9 border-b border-grey/40 p-0.5',
                            hourStarts.has(slot) && 'border-l',
                          )}
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
                                'block h-8 w-8 rounded-sm transition-colors',
                                isSelected
                                  ? 'bg-navy text-white'
                                  : `${FREE_CELL} hover:bg-[color-mix(in_srgb,var(--status-approved)_40%,white)]`,
                              )}
                            />
                          ) : (
                            <span
                              title={busy ? t.booking.busy : undefined}
                              aria-label={busy ? t.booking.busy : undefined}
                              className={cn(
                                'block h-8 w-8 rounded-sm',
                                busy ? BUSY_CELL : 'bg-sunken',
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

      <ul
        aria-label={t.booking.legendLabel}
        className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate"
      >
        {[
          { swatch: FREE_CELL, label: t.booking.legendFree },
          { swatch: 'bg-navy', label: t.booking.legendSelected },
          { swatch: BUSY_CELL, label: t.booking.legendBusy },
          { swatch: 'bg-sunken', label: t.booking.legendNoFit },
        ].map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                'h-5 w-5 rounded-sm border border-grey/40',
                item.swatch,
              )}
            />
            {item.label}
          </li>
        ))}
      </ul>

      {unavailable.length > 0 && (
        <section
          aria-label={t.booking.unavailableTitle}
          className="flex flex-col gap-2"
        >
          <h3 className="text-sm font-medium text-navy">
            {t.booking.unavailableTitle}
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {unavailable.map((u) => (
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
