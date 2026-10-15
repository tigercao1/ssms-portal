import type { Locale, Messages } from '@/i18n/core/types';
import { formatMoney } from '@/features/admin/payroll/payrollFormat';
import type { MyLesson } from './types';

function utcDay(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function zhParts(date: string, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    ...options,
    timeZone: 'UTC',
  }).formatToParts(utcDay(date));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    weekday: part('weekday'),
  };
}

export function lessonDay(date: string, locale: Locale) {
  if (locale === 'zh-CN') {
    const { month, day, weekday } = zhParts(date, {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    });
    return `${month}月${day}日 ${weekday}`;
  }
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(utcDay(date));
}

export function periodDates(startsOn: string, endsOn: string, locale: Locale) {
  const sameYear = startsOn.slice(0, 4) === endsOn.slice(0, 4);
  if (locale === 'zh-CN') {
    const options = {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    } as const;
    const start = zhParts(startsOn, options);
    const end = zhParts(endsOn, options);
    const endText = `${sameYear ? '' : `${end.year}年`}${end.month}月${end.day}日`;
    return `${start.year}年${start.month}月${start.day}日 – ${endText}`;
  }
  const short = new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const long = new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const start = (sameYear ? short : long).format(utcDay(startsOn));
  return `${start} – ${long.format(utcDay(endsOn))}`;
}

export function hoursOf(minutes: number) {
  return String(Number((minutes / 60).toFixed(2)));
}

export function rateTimes(lesson: MyLesson, t: Messages, locale: Locale) {
  if (lesson.rate === null) return null;
  const rate = formatMoney(lesson.rate, lesson.currency, locale);
  if (lesson.rateUnit === 'day') {
    return t.myLessons.rateTimesDay.replace('{rate}', rate);
  }
  return t.myLessons.rateTimesHour
    .replace('{rate}', rate)
    .replace('{hours}', hoursOf(lesson.minutes));
}

export function lessonsCount(n: number, t: Messages) {
  return n === 1
    ? t.myLessons.lessonsOne
    : t.myLessons.lessonsMany.replace('{n}', String(n));
}

export function adjustmentsCount(n: number, t: Messages) {
  return n === 1
    ? t.myLessons.adjustmentsOne
    : t.myLessons.adjustmentsMany.replace('{n}', String(n));
}

export function studentsText(students: string[], t: Messages) {
  if (students.length === 0) return '—';
  if (students.length > 2) {
    return t.myLessons.studentsCount.replace('{n}', String(students.length));
  }
  return students.join(', ');
}

export function signedMoney(amount: number, currency: string, locale: Locale) {
  const text = formatMoney(amount, currency, locale);
  return amount > 0 ? `+${text}` : text;
}

export function moneyList(
  totals: { currency: string; amount: number }[],
  locale: Locale,
) {
  return totals
    .map((x) => formatMoney(x.amount, x.currency, locale))
    .join(' + ');
}
