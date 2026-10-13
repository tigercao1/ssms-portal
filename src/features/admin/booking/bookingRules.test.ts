import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  bookingProblem,
  fromDraft,
  nextWeekday,
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
