import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  bookingProblem,
  byHour,
  formatSchoolHour,
  fromDraft,
  groupedBlock,
  isPastStart,
  largestFittingBlock,
  nextWeekday,
  onStartGrid,
  readBlockSize,
  saveBlockSize,
  schoolInstant,
  schoolParts,
  shiftDate,
  toDraft,
  weekdayOf,
} from './bookingRules';

describe('school time helpers', () => {
  it.each([
    ['2026-12-12', '08:00', '2026-12-12T13:00:00.000Z'],
    ['2026-07-04', '08:00', '2026-07-04T12:00:00.000Z'],
    ['2026-11-01', '12:00', '2026-11-01T17:00:00.000Z'],
    ['2026-03-08', '03:00', '2026-03-08T07:00:00.000Z'],
  ])('%s %s in Toronto is %s', (date, time, iso) => {
    expect(schoolInstant(date, time)).toBe(iso);
    expect(schoolParts(iso)).toEqual({ date, time });
  });

  it('reads the Toronto date across midnight UTC', () => {
    expect(schoolParts('2026-01-01T03:15:00Z')).toEqual({
      date: '2025-12-31',
      time: '22:15',
    });
  });

  it('finds weekdays and the next matching day', () => {
    expect(weekdayOf('2026-12-12')).toBe('sat');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(nextWeekday('2026-12-10', 'sat')).toBe('2026-12-12');
    expect(nextWeekday('2026-12-12', 'sat')).toBe('2026-12-12');
    expect(nextWeekday('2026-12-13', 'mon')).toBe('2026-12-14');
  });
});

describe('settings drafts', () => {
  const settings = {
    dayStartTime: '08:00',
    dayEndTime: '18:00',
    slotMinutes: 30,
    weekdayOverrides: {
      sat: { start: '07:00', end: '20:00' },
      sun: { closed: true as const },
    },
  };

  it('round-trips weekday overrides', () => {
    const draft = toDraft(settings);
    expect(draft.days.mon.mode).toBe('default');
    expect(draft.days.sat).toEqual({
      mode: 'custom',
      start: '07:00',
      end: '20:00',
    });
    expect(draft.days.sun.mode).toBe('closed');
    expect(fromDraft(draft)).toEqual(settings);
  });

  it('rejects a day that ends before it starts', () => {
    const draft = toDraft(settings);
    expect(fromDraft({ ...draft, dayEndTime: '07:00' })).toBeNull();
    expect(
      fromDraft({
        ...draft,
        days: {
          ...draft.days,
          sat: { mode: 'custom', start: '12:00', end: '' },
        },
      }),
    ).toBeNull();
  });
});

describe('bookingProblem', () => {
  it('reads conflicts, Google errors and plain messages', () => {
    expect(
      bookingProblem(new ApiError(409, 'busy', { conflicts: [] })),
    ).toEqual({ kind: 'conflict', conflicts: [] });
    expect(
      bookingProblem(
        new ApiError(400, 'Lessons must start on a 5-minute boundary', {
          code: 'START_NOT_ALIGNED',
        }),
      ),
    ).toEqual({ kind: 'misaligned' });
    expect(
      bookingProblem(
        new ApiError(502, 'google', {
          googleStatus: 403,
          googleReason: 'forbidden',
        }),
      ),
    ).toEqual({ kind: 'google', status: 403, reason: 'forbidden' });
    expect(bookingProblem(new ApiError(502, 'google'))).toEqual({
      kind: 'google',
      status: null,
      reason: null,
    });
    expect(
      bookingProblem(new ApiError(409, 'Cancelled classes cannot be edited')),
    ).toEqual({
      kind: 'message',
      message: 'Cancelled classes cannot be edited',
    });
    expect(bookingProblem(new Error('x'))).toEqual({ kind: 'unknown' });
  });
});

describe('start time blocks', () => {
  const at = (time: string) => schoolInstant('2026-12-12', time);

  it('groups starts by hour only at 15 and 5 minutes', () => {
    expect([60, 30, 15, 5].map(groupedBlock)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    const slots = ['09:00', '09:05', '09:55', '10:00', '13:30'].map(at);
    expect(byHour(slots)).toEqual([
      { hour: '09', slots: slots.slice(0, 3) },
      { hour: '10', slots: [slots[3]] },
      { hour: '13', slots: [slots[4]] },
    ]);
    expect(formatSchoolHour(at('10:05'), 'en')).toBe('10 AM');
    expect(formatSchoolHour(at('13:00'), 'en')).toBe('1 PM');
  });

  it('accepts only times on the 5-minute grid', () => {
    expect(onStartGrid('10:05')).toBe(true);
    expect(onStartGrid('10:00')).toBe(true);
    expect(onStartGrid('10:07')).toBe(false);
    expect(onStartGrid('25:00')).toBe(false);
    expect(onStartGrid('')).toBe(false);
  });

  it('finds the largest block a start sits on', () => {
    expect(largestFittingBlock('10:00')).toBe(60);
    expect(largestFittingBlock('10:30')).toBe(30);
    expect(largestFittingBlock('10:45')).toBe(15);
    expect(largestFittingBlock('10:05')).toBe(5);
  });

  it('remembers the block size on the device and ignores junk', () => {
    localStorage.removeItem('ssms.bookingBlock');
    expect(readBlockSize()).toBeNull();
    saveBlockSize(5);
    expect(readBlockSize()).toBe(5);
    localStorage.setItem('ssms.bookingBlock', '7');
    expect(readBlockSize()).toBeNull();
  });

  it('tells a past start from a future one', () => {
    const now = Date.parse('2026-12-12T15:00:00.000Z');
    expect(isPastStart('2026-12-12T14:55:00.000Z', now)).toBe(true);
    expect(isPastStart('2026-12-12T15:00:00.000Z', now)).toBe(false);
    expect(isPastStart('', now)).toBe(false);
  });
});
