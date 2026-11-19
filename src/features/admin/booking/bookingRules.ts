import type { Locale } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import {
  WEEKDAYS,
  type BookingConflict,
  type BookingSettingsInput,
  type DayWindow,
  type Weekday,
  type WeekdayOverride,
} from './types';

export const SCHOOL_TIME_ZONE = 'America/Toronto';
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHOOL_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function wallClock(ms: number): number[] {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return ['year', 'month', 'day', 'hour', 'minute', 'second'].map(
    (k) => parts[k] ?? 0,
  );
}

function offsetAt(ms: number): number {
  const [y = 0, mo = 1, d = 1, h = 0, mi = 0, s = 0] = wallClock(ms);
  return Date.UTC(y, mo - 1, d, h, mi, s) - (ms - (ms % 1000));
}

const pad = (n: number) => String(n).padStart(2, '0');

export function schoolParts(iso: string | number | Date): {
  date: string;
  time: string;
} {
  const [y = 0, mo = 1, d = 1, h = 0, mi = 0] = wallClock(
    new Date(iso).getTime(),
  );
  return { date: `${y}-${pad(mo)}-${pad(d)}`, time: `${pad(h)}:${pad(mi)}` };
}

export function schoolInstant(date: string, time: string): string {
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const guess = wall - offsetAt(wall);
  return new Date(wall - offsetAt(guess)).toISOString();
}

export function shiftDate(date: string, days: number): string {
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function weekdayOf(date: string): Weekday {
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  return WEEKDAYS[(new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7]!;
}

export function nextWeekday(from: string, weekday: Weekday): string {
  const offset =
    (WEEKDAYS.indexOf(weekday) - WEEKDAYS.indexOf(weekdayOf(from)) + 7) % 7;
  return shiftDate(from, offset);
}

function localeTag(locale: Locale) {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-CA';
}

export function formatSchoolTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: SCHOOL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export function formatSchoolDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: SCHOOL_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * MINUTE_MS).toISOString();
}

export const BLOCK_SIZES = [60, 30, 15, 5] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];
export const START_STEP_MINUTES = 5;
const BLOCK_KEY = 'ssms.bookingBlock';

export function isBlockSize(value: unknown): value is BlockSize {
  return BLOCK_SIZES.some((size) => size === value);
}

export function groupedBlock(block: number): boolean {
  return block < 30;
}

export function readBlockSize(): BlockSize | null {
  try {
    const stored = Number(window.localStorage.getItem(BLOCK_KEY));
    return isBlockSize(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveBlockSize(block: BlockSize) {
  try {
    window.localStorage.setItem(BLOCK_KEY, String(block));
  } catch {
    return;
  }
}

export function onStartGrid(time: string): boolean {
  if (!isTimeOfDay(time)) return false;
  return Number(time.slice(3)) % START_STEP_MINUTES === 0;
}

export function largestFittingBlock(time: string): BlockSize {
  const minute = Number(time.slice(3));
  return BLOCK_SIZES.find((size) => minute % size === 0) ?? START_STEP_MINUTES;
}

export function byHour(slots: string[]): { hour: string; slots: string[] }[] {
  const groups: { hour: string; slots: string[] }[] = [];
  for (const slot of slots) {
    const hour = schoolParts(slot).time.slice(0, 2);
    const current = groups[groups.length - 1];
    if (current?.hour === hour) current.slots.push(slot);
    else groups.push({ hour, slots: [slot] });
  }
  return groups;
}

export function formatSchoolHour(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    timeZone: SCHOOL_TIME_ZONE,
    hour: 'numeric',
  }).format(new Date(iso));
}

export function isPastStart(startsAt: string, now: number): boolean {
  return startsAt !== '' && Date.parse(startsAt) < now;
}

export function isTimeOfDay(value: string): boolean {
  return TIME_OF_DAY.test(value);
}

export type DayMode = 'default' | 'custom' | 'closed';

export interface SettingsDraft {
  dayStartTime: string;
  dayEndTime: string;
  slotMinutes: number;
  days: Record<Weekday, { mode: DayMode; start: string; end: string }>;
}

export function toDraft(settings: BookingSettingsInput): SettingsDraft {
  const days = {} as SettingsDraft['days'];
  for (const day of WEEKDAYS) {
    const override: WeekdayOverride | undefined =
      settings.weekdayOverrides[day];
    days[day] = !override
      ? {
          mode: 'default',
          start: settings.dayStartTime,
          end: settings.dayEndTime,
        }
      : 'closed' in override
        ? {
            mode: 'closed',
            start: settings.dayStartTime,
            end: settings.dayEndTime,
          }
        : { mode: 'custom', start: override.start, end: override.end };
  }
  return {
    dayStartTime: settings.dayStartTime,
    dayEndTime: settings.dayEndTime,
    slotMinutes: settings.slotMinutes,
    days,
  };
}

export function windowValid(w: DayWindow): boolean {
  return isTimeOfDay(w.start) && isTimeOfDay(w.end) && w.end > w.start;
}

export function fromDraft(draft: SettingsDraft): BookingSettingsInput | null {
  if (!windowValid({ start: draft.dayStartTime, end: draft.dayEndTime })) {
    return null;
  }
  const weekdayOverrides: BookingSettingsInput['weekdayOverrides'] = {};
  for (const day of WEEKDAYS) {
    const entry = draft.days[day];
    if (entry.mode === 'closed') weekdayOverrides[day] = { closed: true };
    if (entry.mode === 'custom') {
      if (!windowValid(entry)) return null;
      weekdayOverrides[day] = { start: entry.start, end: entry.end };
    }
  }
  return {
    dayStartTime: draft.dayStartTime,
    dayEndTime: draft.dayEndTime,
    slotMinutes: draft.slotMinutes,
    weekdayOverrides,
  };
}

export const START_NOT_ALIGNED = 'START_NOT_ALIGNED';

export type BookingProblem =
  | { kind: 'conflict'; conflicts: BookingConflict[] }
  | { kind: 'misaligned' }
  | { kind: 'google'; status: number | null; reason: string | null }
  | { kind: 'message'; message: string }
  | { kind: 'unknown' };

export function bookingProblem(err: unknown): BookingProblem {
  if (!(err instanceof ApiError)) return { kind: 'unknown' };
  const body = (err.body ?? {}) as {
    conflicts?: BookingConflict[];
    googleStatus?: number | null;
    googleReason?: string | null;
    code?: string;
  };
  if (err.status === 400 && body.code === START_NOT_ALIGNED) {
    return { kind: 'misaligned' };
  }
  if (err.status === 409 && Array.isArray(body.conflicts)) {
    return { kind: 'conflict', conflicts: body.conflicts };
  }
  if (err.status === 502) {
    return {
      kind: 'google',
      status: body.googleStatus ?? null,
      reason: body.googleReason ?? null,
    };
  }
  return { kind: 'message', message: err.message };
}
