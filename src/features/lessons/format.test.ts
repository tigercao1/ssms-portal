import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/messages/en';
import { zhCN } from '@/i18n/messages/zh-CN';
import { fakeMyLesson } from './fixtures';
import {
  hoursOf,
  lessonDay,
  periodDates,
  rateTimes,
  studentsText,
} from './format';

describe('lessons format', () => {
  it('shows an hourly rate times the lesson hours', () => {
    expect(rateTimes(fakeMyLesson(), en, 'en')).toBe('$90.00 × 2h');
    expect(rateTimes(fakeMyLesson({ minutes: 90 }), en, 'en')).toBe(
      '$90.00 × 1.5h',
    );
    expect(rateTimes(fakeMyLesson(), zhCN, 'zh-CN')).toBe(
      'CA$90.00/小时 × 2 小时',
    );
  });

  it('shows a daily rate once per lesson, whatever its length', () => {
    const lesson = fakeMyLesson({ rate: 400, rateUnit: 'day', minutes: 240 });
    expect(rateTimes(lesson, en, 'en')).toBe('$400.00 × 1 day');
    expect(rateTimes(lesson, zhCN, 'zh-CN')).toBe('CA$400.00/天 × 1 天');
  });

  it('has no rate text without a rate', () => {
    expect(rateTimes(fakeMyLesson({ rate: null }), en, 'en')).toBeNull();
  });

  it('rounds hours to at most two decimals', () => {
    expect(hoursOf(120)).toBe('2');
    expect(hoursOf(45)).toBe('0.75');
    expect(hoursOf(100)).toBe('1.67');
  });

  it('formats the Toronto date as given, in each language', () => {
    expect(lessonDay('2027-02-13', 'en')).toBe('Sat, Feb 13');
    expect(lessonDay('2027-02-13', 'zh-CN')).toBe('2月13日 周六');
  });

  it('formats a pay period range', () => {
    expect(periodDates('2027-01-25', '2027-02-07', 'en')).toBe(
      'Jan 25 – Feb 7, 2027',
    );
    expect(periodDates('2026-12-28', '2027-01-10', 'en')).toBe(
      'Dec 28, 2026 – Jan 10, 2027',
    );
    expect(periodDates('2027-01-25', '2027-02-07', 'zh-CN')).toBe(
      '2027年1月25日 – 2月7日',
    );
    expect(periodDates('2026-12-28', '2027-01-10', 'zh-CN')).toBe(
      '2026年12月28日 – 2027年1月10日',
    );
  });

  it('lists up to two students and counts larger groups', () => {
    expect(studentsText([], en)).toBe('—');
    expect(studentsText(['Wei Z.', 'Amy L.'], en)).toBe('Wei Z., Amy L.');
    expect(studentsText(['A.', 'B.', 'C.'], zhCN)).toBe('3 名学员');
  });
});
