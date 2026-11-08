import type { AdminClass } from '@/lib/types';
import { schoolInstant, schoolParts, shiftDate } from './booking/bookingRules';
import type { ClassFilter } from './lessonsApi';
import { NOT_CANCELLED_STATUSES, type ClassView } from './lessonRules';

export type ClassesLayout = 'list' | 'calendar';
export type CalendarMode = 'month' | 'week';

export function classesLayoutFrom(value: string | null): ClassesLayout {
  return value === 'calendar' ? 'calendar' : 'list';
}

export function calendarModeFrom(value: string | null): CalendarMode {
  return value === 'week' ? 'week' : 'month';
}

export function calendarAnchorFrom(value: string | null, now: Date): string {
  return value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    shiftDate(value, 0) === value
    ? value
    : schoolParts(now).date;
}

function weekStart(day: string): string {
  const [y = 0, mo = 1, d = 1] = day.split('-').map(Number);
  return shiftDate(day, -new Date(Date.UTC(y, mo - 1, d)).getUTCDay());
}

function monthStart(day: string): string {
  return `${day.slice(0, 8)}01`;
}

function nextMonth(day: string, step: number): string {
  const [y = 0, mo = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1 + step, 1)).toISOString().slice(0, 10);
}

export function calendarDays(mode: CalendarMode, anchor: string): string[] {
  const first =
    mode === 'week' ? weekStart(anchor) : weekStart(monthStart(anchor));
  const last =
    mode === 'week'
      ? shiftDate(first, 6)
      : shiftDate(weekStart(shiftDate(nextMonth(anchor, 1), -1)), 6);
  const days: string[] = [];
  for (let day = first; day <= last; day = shiftDate(day, 1)) days.push(day);
  return days;
}

export function stepAnchor(
  mode: CalendarMode,
  anchor: string,
  step: number,
): string {
  return mode === 'week'
    ? shiftDate(anchor, step * 7)
    : nextMonth(anchor, step);
}

export function calendarFilterFor(
  view: ClassView,
  mode: CalendarMode,
  anchor: string,
): ClassFilter {
  const days = calendarDays(mode, anchor);
  return {
    from: schoolInstant(days[0] as string, '00:00'),
    to: schoolInstant(shiftDate(days.at(-1) as string, 1), '00:00'),
    ...(view.q && { q: view.q }),
    ...(view.instructorId && { instructorId: view.instructorId }),
    ...(view.lessonTypeId && { lessonTypeId: view.lessonTypeId }),
    ...(view.locationId && { locationId: view.locationId }),
    status: view.status || NOT_CANCELLED_STATUSES,
  };
}

export function classesBySchoolDay(
  classes: AdminClass[],
): Map<string, AdminClass[]> {
  const byDay = new Map<string, AdminClass[]>();
  const sorted = [...classes].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
  for (const c of sorted) {
    const day = schoolParts(c.startsAt).date;
    byDay.set(day, [...(byDay.get(day) ?? []), c]);
  }
  return byDay;
}
