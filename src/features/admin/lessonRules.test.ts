import { describe, expect, it } from 'vitest';
import { fakeClass, fakeLessonProduct } from '@/test/msw';
import {
  formatPrice,
  groupClassesByDay,
  looksComplete,
  parsePositiveInt,
  rangeToIso,
} from './lessonRules';

describe('looksComplete', () => {
  const complete = fakeLessonProduct({ durationMin: 120 });

  it('accepts a suggestion with type, size, sessions, duration and instructor', () => {
    expect(looksComplete(complete)).toBe(true);
  });

  it.each([
    ['other type', { lessonType: 'other' as const }],
    ['no size', { groupSize: null }],
    ['no sessions', { sessions: null }],
    ['no duration', { durationMin: null }],
    ['zero duration', { durationMin: 0 }],
    ['no instructor', { instructorId: null }],
    ['already confirmed', { status: 'confirmed' as const }],
    ['ignored', { status: 'ignored' as const }],
  ])('rejects %s', (_label, overrides) => {
    expect(looksComplete({ ...complete, ...overrides })).toBe(false);
  });
});

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

describe('formatPrice', () => {
  it('formats a numeric string in the store currency', () => {
    expect(formatPrice('120.00', 'CAD', 'en')).toMatch(/120\.00/);
  });

  it('formats a number without a currency', () => {
    expect(formatPrice(85, null, 'en')).toBe('85.00');
  });

  it('is empty without a price and passes through unparseable values', () => {
    expect(formatPrice(null, 'CAD', 'en')).toBe('');
    expect(formatPrice('n/a', 'CAD', 'zh-CN')).toBe('n/a');
  });

  it('falls back when the currency code is unknown to Intl', () => {
    expect(formatPrice(10, 'NOT-A-CODE', 'en')).toBe('10.00 NOT-A-CODE');
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
