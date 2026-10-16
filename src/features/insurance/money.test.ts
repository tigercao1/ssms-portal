import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/messages/en';
import { zhCN } from '@/i18n/messages/zh-CN';
import { dollars, listCents, recordStatus } from './money';
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
