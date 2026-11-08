import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeClass } from '@/test/msw';
import {
  classFilterFor,
  groupClassesByDay,
  schoolDayKey,
  type ClassView,
} from './lessonRules';

const view: ClassView = {
  tab: 'all',
  from: '',
  to: '',
  day: '2026-11-10',
  q: '',
  instructorId: '',
  lessonTypeId: '',
  locationId: '',
  status: '',
};

describe.each(['Asia/Shanghai', 'America/Vancouver'])(
  'one-day view in a %s browser',
  (zone) => {
    const original = process.env.TZ;
    beforeEach(() => {
      process.env.TZ = zone;
    });
    afterEach(() => {
      process.env.TZ = original;
    });

    it('runs with the browser in that zone', () => {
      expect(new Date('2026-11-10T00:00:00').toISOString()).not.toBe(
        '2026-11-10T05:00:00.000Z',
      );
    });

    it('asks for Toronto midnight to midnight of the tapped day', () => {
      expect(classFilterFor(view, new Date('2026-11-10T12:00:00Z'))).toEqual({
        from: '2026-11-10T05:00:00.000Z',
        to: '2026-11-11T05:00:00.000Z',
      });
    });

    it('asks for a 25-hour Toronto day when the clocks go back', () => {
      expect(
        classFilterFor({ ...view, day: '2026-11-01' }, new Date()),
      ).toMatchObject({
        from: '2026-11-01T04:00:00.000Z',
        to: '2026-11-02T05:00:00.000Z',
      });
    });

    it('puts a 23:30 Toronto booking under the tapped day', () => {
      const late = fakeClass({
        id: 'late',
        startsAt: '2026-11-11T04:30:00.000Z',
        endsAt: '2026-11-11T05:30:00.000Z',
      });
      const early = fakeClass({
        id: 'early',
        startsAt: '2026-11-10T05:00:00.000Z',
        endsAt: '2026-11-10T06:00:00.000Z',
      });
      expect(
        groupClassesByDay([late, early], schoolDayKey).map((g) => ({
          day: g.day,
          ids: g.classes.map((c) => c.id),
        })),
      ).toEqual([{ day: '2026-11-10', ids: ['early', 'late'] }]);
    });
  },
);
