import { useEffect, useRef, useState } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import type { Locale } from '@/i18n/core/types';
import { cn } from '@/lib/cn';
import { Banner, Button, EmptyState, Field, Input } from '@/components';
import {
  BLOCK_SIZES,
  byHour,
  formatSchoolHour,
  formatSchoolTime,
  groupedBlock,
  onStartGrid,
  schoolInstant,
  schoolParts,
  type BlockSize,
} from './bookingRules';
import type { Availability, InstructorAvailability } from './types';

export interface SlotChoice {
  instructorId: string;
  startsAt: string;
}

type DayPart = 'morning' | 'afternoon' | 'evening';

function dayPart(iso: string): DayPart {
  const time = schoolParts(iso).time;
  if (time < '12:00') return 'morning';
  return time < '17:00' ? 'afternoon' : 'evening';
}

function byDayPart(slots: string[]) {
  const groups: { part: DayPart; slots: string[] }[] = [];
  for (const slot of slots) {
    const part = dayPart(slot);
    const current = groups[groups.length - 1];
    if (current?.part === part) current.slots.push(slot);
    else groups.push({ part, slots: [slot] });
  }
  return groups;
}

function instructorName(row: InstructorAvailability, locale: Locale) {
  return (
    localizeField(row.displayNameEn, row.displayNameZh, locale) ||
    row.displayNameEn
  );
}

function NoCalendarNote({ row }: { row: InstructorAvailability }) {
  const t = useT();
  if (row.googleCalendarId) return null;
  return <span className="text-sm text-slate">{t.booking.noCalendar}</span>;
}

export function SlotPicker({
  availability,
  date,
  block,
  onBlock,
  instructorId,
  onInstructor,
  selected,
  onSelect,
}: {
  availability: Availability;
  date: string;
  block: number;
  onBlock: (block: BlockSize) => void;
  instructorId: string | null;
  onInstructor: (id: string | null) => void;
  selected: SlotChoice | null;
  onSelect: (choice: SlotChoice | null) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [query, setQuery] = useState('');
  const selectedStart = selected?.startsAt ?? null;
  const free = availability.instructors.filter((i) => i.freeSlots.length > 0);
  const chosen =
    availability.instructors.find((i) => i.instructorId === instructorId) ??
    null;
  const chosenId = chosen?.instructorId ?? null;
  const [typed, setTyped] = useState(() =>
    selectedStart && !chosen?.freeSlots.includes(selectedStart)
      ? schoolParts(selectedStart).time
      : '',
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const focusAfter = useRef<'times' | 'list' | null>(null);
  const returnTo = useRef<string | null>(null);
  const timesRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === 'times') {
      const section = timesRef.current;
      (section?.querySelector('button') ?? section)?.focus();
    } else if (target === 'list') {
      const row = returnTo.current && rowRefs.current.get(returnTo.current);
      (row || searchRef.current)?.focus();
    }
  }, [chosenId]);

  if (!availability.window) {
    return <Banner tone="info">{t.booking.dayClosed}</Banner>;
  }
  if (free.length === 0 && !chosen) {
    const notSetUp =
      availability.instructors.length === 0 &&
      availability.unavailable.length > 0;
    return notSetUp ? (
      <EmptyState title={t.booking.notBookableTitle}>
        {t.booking.notBookableBody}
      </EmptyState>
    ) : (
      <EmptyState title={t.booking.noInstructorsTitle}>
        {t.booking.noInstructorsBody}
      </EmptyState>
    );
  }

  const countLabel = (n: number) =>
    n === 1
      ? t.booking.freeTimesOne
      : t.booking.freeTimes.replace('{n}', String(n));

  function chooseInstructor(id: string) {
    focusAfter.current = 'times';
    setTyped('');
    onInstructor(id);
  }

  function changeInstructor() {
    focusAfter.current = 'list';
    returnTo.current = chosenId;
    setTyped('');
    onInstructor(null);
  }

  const blockPicker = (
    <div
      role="group"
      aria-label={t.booking.blockLabel}
      className="grid w-full grid-cols-4 overflow-hidden rounded-md border border-navy sm:w-fit"
    >
      {BLOCK_SIZES.map((size, index) => (
        <button
          key={size}
          type="button"
          aria-pressed={block === size}
          onClick={() => onBlock(size)}
          className={cn(
            'min-h-11 px-4 text-sm transition-colors',
            index > 0 && 'border-l border-navy',
            block === size
              ? 'bg-navy text-white'
              : 'text-navy hover:bg-navy-tint',
          )}
        >
          {t.booking.blockMinutes.replace('{n}', String(size))}
        </button>
      ))}
    </div>
  );

  if (!chosen) {
    const needle = query.trim().toLocaleLowerCase();
    const matches = free.filter(
      (row) =>
        !needle ||
        [row.displayNameEn, row.displayNameZh].some((n) =>
          n?.toLocaleLowerCase().includes(needle),
        ),
    );
    return (
      <div className="flex flex-col gap-4">
        {blockPicker}
        <Field label={t.booking.instructorSearch}>
          {(p) => (
            <Input
              {...p}
              ref={searchRef}
              type="search"
              value={query}
              placeholder={t.booking.instructorSearchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </Field>
        {matches.length === 0 ? (
          <p data-private className="text-sm text-slate">
            {t.booking.instructorSearchEmpty.replace('{q}', query.trim())}
          </p>
        ) : (
          <ul
            aria-label={t.booking.instructorListLabel}
            className="flex flex-col gap-2"
          >
            {matches.map((row) => (
              <li key={row.instructorId}>
                <button
                  ref={(el) => {
                    if (el) rowRefs.current.set(row.instructorId, el);
                    else rowRefs.current.delete(row.instructorId);
                  }}
                  type="button"
                  onClick={() => chooseInstructor(row.instructorId)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-grey/60 px-4 py-2 text-left transition-colors hover:bg-navy-tint"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-ink">
                      {instructorName(row, locale)}
                    </span>
                    <NoCalendarNote row={row} />
                  </span>
                  <span className="shrink-0 text-sm text-slate">
                    {countLabel(row.freeSlots.length)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const name = instructorName(chosen, locale);
  const times = chosen.freeSlots;
  const typedOffGrid = typed !== '' && !onStartGrid(typed);

  function pick(slot: string) {
    if (!chosen) return;
    setTyped('');
    onSelect({ instructorId: chosen.instructorId, startsAt: slot });
  }

  function typeTime(value: string) {
    if (!chosen) return;
    setTyped(value);
    if (onStartGrid(value))
      onSelect({
        instructorId: chosen.instructorId,
        startsAt: schoolInstant(date, value),
      });
    else if (selectedStart) onSelect(null);
  }

  const chip = (slot: string) => {
    const time = formatSchoolTime(slot, locale);
    const isSelected =
      selected?.instructorId === chosen.instructorId &&
      selected.startsAt === slot;
    return (
      <button
        key={slot}
        type="button"
        aria-pressed={isSelected}
        aria-label={t.booking.slotLabel
          .replace('{name}', name)
          .replace('{time}', time)}
        onClick={() => pick(slot)}
        className={cn(
          'min-h-11 rounded-md border font-mono text-sm transition-colors',
          isSelected
            ? 'border-navy bg-navy text-white ring-2 ring-navy ring-offset-2'
            : 'border-grey/60 text-ink hover:bg-navy-tint',
        )}
      >
        {time}
      </button>
    );
  };

  const grid = (slots: string[]) => (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {slots.map(chip)}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-md border border-navy bg-navy-tint px-4 py-2">
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-ink">{name}</span>
          <NoCalendarNote row={chosen} />
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 shrink-0"
          onClick={changeInstructor}
        >
          {t.booking.changeInstructor}
        </Button>
      </div>
      {blockPicker}
      <section
        ref={timesRef}
        tabIndex={-1}
        aria-label={t.booking.timesFor.replace('{name}', name)}
        className="flex flex-col gap-3"
      >
        {times.length === 0 ? (
          <p className="text-sm text-slate">{t.booking.noTimesAtBlock}</p>
        ) : groupedBlock(block) ? (
          <ul className="flex flex-col gap-2">
            {byHour(times).map((group) => {
              const open =
                expanded[group.hour] ??
                (selectedStart !== null && group.slots.includes(selectedStart));
              const panelId = `hour-${chosen.instructorId}-${group.hour}`;
              return (
                <li key={group.hour} className="flex flex-col gap-2">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() =>
                      setExpanded((e) => ({ ...e, [group.hour]: !open }))
                    }
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-grey/60 px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-navy-tint"
                  >
                    <span>
                      {t.booking.hourOpen
                        .replace(
                          '{hour}',
                          formatSchoolHour(group.slots[0] ?? '', locale),
                        )
                        .replace('{n}', String(group.slots.length))}
                    </span>
                    <span aria-hidden className="text-slate">
                      {open ? '−' : '+'}
                    </span>
                  </button>
                  {open && <div id={panelId}>{grid(group.slots)}</div>}
                </li>
              );
            })}
          </ul>
        ) : (
          byDayPart(times).map((group) => (
            <div key={group.part} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-slate">
                {t.booking[group.part]}
              </h3>
              {grid(group.slots)}
            </div>
          ))
        )}
      </section>
      <div className="sm:max-w-xs">
        <Field
          label={t.booking.typeTime}
          hint={t.booking.typeTimeHint}
          error={typedOffGrid ? t.booking.typeTimeOffGrid : undefined}
        >
          {(p) => (
            <Input
              {...p}
              type="time"
              step={300}
              value={typed}
              onChange={(e) => typeTime(e.target.value)}
            />
          )}
        </Field>
      </div>
    </div>
  );
}
