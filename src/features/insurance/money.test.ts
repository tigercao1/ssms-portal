import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/messages/en';
import { zhCN } from '@/i18n/messages/zh-CN';
import {
  dollars,
  fill,
  listCents,
  priceLessons,
  recordStatus,
  requestStatus,
} from './money';
import { insuranceRecord } from './fixtures';
import type {
  InsuranceCoverage,
  InsuranceKind,
  InsurancePaymentStatus,
} from './types';

describe('listCents', () => {
  it('charges $10 per hour per student, at most 4 students', () => {
    expect(listCents(1, 1)).toBe(1000);
    expect(listCents(2, 3)).toBe(6000);
    expect(listCents(2, 4)).toBe(8000);
    expect(listCents(2, 5)).toBe(8000);
    expect(listCents(1, 12)).toBe(4000);
    expect(listCents(2, 0)).toBe(0);
  });
});

describe('priceLessons', () => {
  const cap = { capCents: 40000, seasonPass: false };
  const lessons = [
    { durationHours: 2, studentCount: 2 },
    { durationHours: 1, studentCount: 5 },
    { durationHours: 1, studentCount: 1 },
  ];

  it('prices lessons in order and charges the crossing lesson the remainder', () => {
    expect(priceLessons(lessons, { ...cap, owedCents: 35000 })).toEqual([
      { listCents: 4000, amountCents: 4000 },
      { listCents: 4000, amountCents: 1000 },
      { listCents: 1000, amountCents: 0 },
    ]);
  });

  it('charges list prices below the cap and nothing once capped', () => {
    expect(
      priceLessons(lessons, { ...cap, owedCents: 0 }).map((p) => p.amountCents),
    ).toEqual([4000, 4000, 1000]);
    expect(
      priceLessons(lessons, { ...cap, owedCents: 41000 }).map(
        (p) => p.amountCents,
      ),
    ).toEqual([0, 0, 0]);
  });

  it('makes every lesson free with a season pass', () => {
    expect(
      priceLessons(lessons, { ...cap, owedCents: 0, seasonPass: true }).map(
        (p) => p.amountCents,
      ),
    ).toEqual([0, 0, 0]);
  });
});

describe('fill', () => {
  it('replaces every named placeholder and keeps unknown ones', () => {
    expect(fill('{a} + {a} = {b} {c}', { a: 1, b: '2' })).toBe('1 + 1 = 2 {c}');
  });
});

describe('requestStatus', () => {
  const lesson = insuranceRecord();
  it.each([
    ['unpaid', '待付款', 'warn'],
    ['paid', '已支付', 'done'],
    ['not_required', '封顶后免费', 'info'],
    ['voided', '已作废', 'muted'],
  ] as const)('%s → %s', (paymentStatus, label, tone) => {
    expect(requestStatus({ paymentStatus, lessons: [lesson] }, zhCN)).toEqual({
      label,
      tone,
    });
  });

  it('calls a free season-pass request a season pass', () => {
    expect(
      requestStatus(
        {
          paymentStatus: 'not_required',
          lessons: [{ ...lesson, coverage: 'season_pass' }],
        },
        en,
      ).label,
    ).toBe('Season pass');
  });
});

describe('dollars', () => {
  it('formats whole and fractional dollars', () => {
    expect(dollars(0)).toBe('$0');
    expect(dollars(40000)).toBe('$400');
    expect(dollars(1250)).toBe('$12.50');
  });
});

describe('recordStatus', () => {
  const cases: [
    InsuranceKind,
    InsuranceCoverage | null,
    InsurancePaymentStatus,
    string,
    string | null,
  ][] = [
    ['lesson', 'per_lesson', 'unpaid', '待付款', null],
    ['lesson', 'per_lesson', 'paid', '已支付', null],
    ['lesson', 'per_lesson', 'voided', '已作废', null],
    ['lesson', 'cap_top_up', 'unpaid', '已封顶', '待付款'],
    ['lesson', 'cap_top_up', 'paid', '已封顶', '已支付'],
    ['lesson', 'cap_top_up', 'voided', '已作废', null],
    ['lesson', 'capped', 'not_required', '已封顶免付', null],
    ['lesson', 'capped', 'voided', '已作废', null],
    ['lesson', 'season_pass', 'not_required', '已登记', null],
    ['lesson', 'season_pass', 'voided', '已作废', null],
    ['season_pass', null, 'unpaid', '整季保险', '待付款'],
    ['season_pass', null, 'paid', '整季保险', '已支付'],
    ['season_pass', null, 'voided', '已作废', null],
  ];

  it.each(cases)(
    '%s · %s · %s → %s %s',
    (kind, coverage, paymentStatus, label, sub) => {
      expect(recordStatus({ kind, coverage, paymentStatus }, zhCN)).toEqual(
        expect.objectContaining({ label, sub }),
      );
    },
  );

  it('labels the statuses in English', () => {
    const label = (
      kind: InsuranceKind,
      coverage: InsuranceCoverage | null,
      paymentStatus: InsurancePaymentStatus,
    ) => {
      const s = recordStatus({ kind, coverage, paymentStatus }, en);
      return [s.label, s.sub];
    };
    expect(label('lesson', 'per_lesson', 'unpaid')).toEqual(['Unpaid', null]);
    expect(label('lesson', 'per_lesson', 'paid')).toEqual(['Paid', null]);
    expect(label('lesson', 'cap_top_up', 'paid')).toEqual(['Capped', 'Paid']);
    expect(label('lesson', 'capped', 'not_required')).toEqual([
      'Capped · free',
      null,
    ]);
    expect(label('lesson', 'season_pass', 'not_required')).toEqual([
      'Registered',
      null,
    ]);
    expect(label('season_pass', null, 'unpaid')).toEqual([
      'Season pass',
      'Unpaid',
    ]);
    expect(label('lesson', 'per_lesson', 'voided')).toEqual(['Voided', null]);
  });
});
