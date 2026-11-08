import { describe, expect, it } from 'vitest';
import { fakeClass } from '@/test/msw';
import {
  calendarAnchorFrom,
  calendarDays,
  calendarFilterFor,
  classesBySchoolDay,
  stepAnchor,
} from './calendarRules';
import type { ClassView } from './lessonRules';

const view: ClassView = {
  tab: 'upcoming',
  from: '',
  to: '',
  day: '',
  q: '',
  instructorId: '',
  lessonTypeId: '',
  locationId: '',
  status: '',
};

describe('calendarDays', () => {
  it('fills whole Sunday-first weeks around the month', () => {
    const days = calendarDays('month', '2026-10-15');
    expect(days[0]).toBe('2026-09-27');
    expect(days.at(-1)).toBe('2026-10-31');
    expect(days).toHaveLength(35);
  });

  it('covers the seven days of the anchor week', () => {
    expect(calendarDays('week', '2026-11-11')).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
  });
});

describe('calendarFilterFor', () => {
  it('sends the month grid as Toronto midnights across the DST change', () => {
    expect(calendarFilterFor(view, 'month', '2026-11-20')).toEqual({
      from: '2026-11-01T04:00:00.000Z',
      to: '2026-12-06T05:00:00.000Z',
      status: 'scheduled,completed,no_show',
    });
  });

  it('sends the week with the filters and an explicit status, ignoring the tab', () => {
    expect(
      calendarFilterFor(
        {
          ...view,
          q: 'lily',
          instructorId: 'inst-2',
          lessonTypeId: 'lt-1',
          locationId: 'loc-2',
          status: 'cancelled',
        },
        'week',
        '2026-11-08',
      ),
    ).toEqual({
      from: '2026-11-08T05:00:00.000Z',
      to: '2026-11-15T05:00:00.000Z',
      q: 'lily',
      instructorId: 'inst-2',
      lessonTypeId: 'lt-1',
      locationId: 'loc-2',
      status: 'cancelled',
    });
  });
});

describe('stepAnchor and calendarAnchorFrom', () => {
  it('moves by whole months and weeks', () => {
    expect(stepAnchor('month', '2026-01-31', 1)).toBe('2026-02-01');
    expect(stepAnchor('month', '2026-01-10', -1)).toBe('2025-12-01');
    expect(stepAnchor('week', '2026-12-29', 1)).toBe('2027-01-05');
  });

  it('falls back to the Toronto date for a missing or bad value', () => {
    const lateEvening = new Date('2026-11-09T03:00:00Z');
    expect(calendarAnchorFrom(null, lateEvening)).toBe('2026-11-08');
    expect(calendarAnchorFrom('2026-02-30', lateEvening)).toBe('2026-11-08');
    expect(calendarAnchorFrom('2026-12-24', lateEvening)).toBe('2026-12-24');
  });
});

describe('classesBySchoolDay', () => {
  it('groups by the Toronto date in start order', () => {
    const late = fakeClass({ id: 'late', startsAt: '2026-11-09T02:00:00Z' });
    const early = fakeClass({ id: 'early', startsAt: '2026-11-08T15:00:00Z' });
    const next = fakeClass({ id: 'next', startsAt: '2026-11-09T15:00:00Z' });
    const byDay = classesBySchoolDay([next, late, early]);
    expect(byDay.get('2026-11-08')?.map((c) => c.id)).toEqual([
      'early',
      'late',
    ]);
    expect(byDay.get('2026-11-09')?.map((c) => c.id)).toEqual(['next']);
  });
});
