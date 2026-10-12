import { describe, expect, it } from 'vitest';
import { fakeClass } from '@/test/msw';
import {
  customerName,
  formatRate,
  groupClassesByDay,
  parsePositiveInt,
  parseRate,
  rangeToIso,
  rateIsCurrent,
} from './lessonRules';

describe('parsePositiveInt', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['4', 4],
    [' 90 ', 90],
    ['0', 'invalid'],
    ['-1', 'invalid'],
    ['1.5', 'invalid'],
    ['abc', 'invalid'],
    ['10001', 'invalid'],
  ])('%j -> %j', (input, expected) => {
    expect(parsePositiveInt(input)).toBe(expected);
  });
});

describe('parseRate', () => {
  it.each([
    ['45', 45],
    [' 52.5 ', 52.5],
    ['0', 0],
    ['60.25', 60.25],
    ['', 'invalid'],
    ['-1', 'invalid'],
    ['1.234', 'invalid'],
    ['abc', 'invalid'],
    ['100000000', 'invalid'],
  ])('%j -> %j', (input, expected) => {
    expect(parseRate(input)).toBe(expected);
  });
});

describe('formatRate', () => {
  it('formats the amount in its currency', () => {
    expect(formatRate(45, 'CAD', 'en')).toMatch(/45\.00/);
  });

  it('falls back when the currency code is unknown to Intl', () => {
    expect(formatRate(10, 'NOT-A-CODE', 'zh-CN')).toBe('10.00 NOT-A-CODE');
  });
});

describe('rateIsCurrent', () => {
  it('includes both bounds and treats a missing end as open', () => {
    const rate = { effectiveFrom: '2026-11-01', effectiveTo: '2026-11-30' };
    expect(rateIsCurrent(rate, '2026-11-01')).toBe(true);
    expect(rateIsCurrent(rate, '2026-11-30')).toBe(true);
    expect(rateIsCurrent(rate, '2026-12-01')).toBe(false);
    expect(rateIsCurrent(rate, '2026-10-31')).toBe(false);
    expect(
      rateIsCurrent(
        { effectiveFrom: '2026-11-01', effectiveTo: null },
        '2030-01-01',
      ),
    ).toBe(true);
  });
});

describe('customerName', () => {
  it('joins the names that are present', () => {
    expect(customerName({ firstName: 'Lily', lastName: 'Chen' })).toBe(
      'Lily Chen',
    );
    expect(customerName({ firstName: null, lastName: 'Chen' })).toBe('Chen');
    expect(customerName({ firstName: null, lastName: null })).toBe('');
  });
});

describe('groupClassesByDay', () => {
  it('groups by local day and sorts by start time', () => {
    const groups = groupClassesByDay([
      fakeClass({ id: 'b', startsAt: '2026-12-06T09:00:00' }),
      fakeClass({ id: 'a2', startsAt: '2026-12-05T14:00:00' }),
      fakeClass({ id: 'a1', startsAt: '2026-12-05T08:00:00' }),
    ]);
    expect(groups.map((g) => [g.day, g.classes.map((c) => c.id)])).toEqual([
      ['2026-12-05', ['a1', 'a2']],
      ['2026-12-06', ['b']],
    ]);
  });
});

describe('rangeToIso', () => {
  it('covers whole local days, end exclusive', () => {
    const { from, to } = rangeToIso('2026-12-01', '2026-12-03');
    expect(new Date(from)).toEqual(new Date('2026-12-01T00:00:00'));
    expect(new Date(to)).toEqual(new Date('2026-12-04T00:00:00'));
  });
});
