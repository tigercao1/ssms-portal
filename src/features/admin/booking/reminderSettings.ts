import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Locale, Messages } from '@/i18n/core/types';
import { api, ApiError } from '@/lib/api';
import { SCHOOL_TIME_ZONE } from './bookingRules';

export interface ReminderSettings {
  enabled: boolean;
  offsetsMinutes: number[];
  enabledAt: string;
  updatedAt: string;
}

export interface ReminderSettingsInput {
  enabled: boolean;
  offsetsMinutes: number[];
}

export type ReminderUnit = 'minutes' | 'hours' | 'days';

export interface ReminderDraft {
  id: number;
  amount: string;
  unit: ReminderUnit;
}

export const MAX_REMINDERS = 5;

export const REMINDER_UNITS: Record<ReminderUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

const reminderSettingsKey = ['admin', 'booking', 'reminder-settings'] as const;

export function useReminderSettings() {
  return useQuery({
    queryKey: reminderSettingsKey,
    queryFn: () => api<ReminderSettings>('/admin/booking/reminder-settings'),
  });
}

export function useSaveReminderSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReminderSettingsInput) =>
      api<ReminderSettings>('/admin/booking/reminder-settings', {
        method: 'PUT',
        body,
      }),
    onSuccess: (saved) => qc.setQueryData(reminderSettingsKey, saved),
  });
}

export function toReminderDraft(minutes: number, id: number): ReminderDraft {
  const unit: ReminderUnit =
    minutes % REMINDER_UNITS.days === 0
      ? 'days'
      : minutes % REMINDER_UNITS.hours === 0
        ? 'hours'
        : 'minutes';
  return { id, amount: String(minutes / REMINDER_UNITS[unit]), unit };
}

export function draftMinutes(draft: ReminderDraft): number | null {
  const amount = draft.amount.trim();
  if (!/^\d+$/.test(amount)) return null;
  return Number(amount) * REMINDER_UNITS[draft.unit];
}

const API_MESSAGES: [string, keyof Messages['bookingReminders']][] = [
  ['Add at least one reminder time', 'errRequired'],
  ['Add at most', 'errTooMany'],
  ['must be different', 'errDuplicate'],
  ['whole number of minutes', 'errRange'],
];

export function reminderErrors(error: unknown, t: Messages): string[] {
  if (!(error instanceof ApiError)) return [t.errors.generic];
  const body = error.body as { message?: unknown } | undefined;
  const raw = Array.isArray(body?.message)
    ? body.message.map(String)
    : [error.message];
  const messages = raw.map((message) => {
    const known = API_MESSAGES.find(([text]) => message.includes(text));
    return known ? t.bookingReminders[known[1]] : message;
  });
  return [...new Set(messages)];
}

export function torontoDateTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SCHOOL_TIME_ZONE,
  }).format(new Date(iso));
}
