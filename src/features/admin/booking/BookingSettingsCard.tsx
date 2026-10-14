import { useId, useState, type FormEvent } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Select,
  Spinner,
} from '@/components';
import { errorText } from '../LessonTypesPage';
import { useBookingSettings, useSaveBookingSettings } from './bookingApi';
import {
  fromDraft,
  toDraft,
  type DayMode,
  type SettingsDraft,
} from './bookingRules';
import { WEEKDAYS, type BookingSettings, type Weekday } from './types';

const DAY_KEYS: Record<Weekday, keyof Messages['booking']> = {
  mon: 'dayMon',
  tue: 'dayTue',
  wed: 'dayWed',
  thu: 'dayThu',
  fri: 'dayFri',
  sat: 'daySat',
  sun: 'daySun',
};

export function BookingSettingsCard() {
  const t = useT();
  const titleId = useId();
  const settings = useBookingSettings();
  return (
    <Card>
      <section aria-labelledby={titleId}>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-lg">
                {t.booking.settingsTitle}
              </h2>
              <p className="text-sm text-slate">{t.booking.settingsBody}</p>
            </div>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="mt-1 h-5 w-5 shrink-0 text-navy transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 8l5 5 5-5" />
            </svg>
          </summary>
          <div className="mt-4">
            {settings.isLoading ? (
              <Spinner />
            ) : settings.isError || !settings.data ? (
              <Banner tone="error">
                {errorText(settings.error, t.errors.generic)}
              </Banner>
            ) : (
              <SettingsForm settings={settings.data} />
            )}
          </div>
        </details>
      </section>
    </Card>
  );
}

function SettingsForm({ settings }: { settings: BookingSettings }) {
  const t = useT();
  const save = useSaveBookingSettings();
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(settings));
  const input = fromDraft(draft);

  const update = (patch: Partial<SettingsDraft>) => {
    save.reset();
    setDraft((d) => ({ ...d, ...patch }));
  };
  const updateDay = (
    day: Weekday,
    patch: Partial<SettingsDraft['days'][Weekday]>,
  ) => {
    const current = draft.days[day];
    const hours =
      patch.mode === 'custom' && current.mode !== 'custom'
        ? { start: draft.dayStartTime, end: draft.dayEndTime }
        : {};
    update({
      days: { ...draft.days, [day]: { ...current, ...hours, ...patch } },
    });
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (input) save.mutate(input);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <Field label={t.booking.slotMinutes}>
            {(p) => (
              <Select
                {...p}
                value={draft.slotMinutes}
                onChange={(e) =>
                  update({ slotMinutes: Number(e.target.value) })
                }
              >
                {[15, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {t.booking.minutesOption.replace('{n}', String(n))}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t.booking.dayStart}>
          {(p) => (
            <Input
              {...p}
              type="time"
              step={900}
              value={draft.dayStartTime}
              onChange={(e) => update({ dayStartTime: e.target.value })}
            />
          )}
        </Field>
        <Field label={t.booking.dayEnd}>
          {(p) => (
            <Input
              {...p}
              type="time"
              step={900}
              value={draft.dayEndTime}
              onChange={(e) => update({ dayEndTime: e.target.value })}
            />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm font-medium text-navy">
          {t.booking.weekdayTitle}
        </legend>
        {WEEKDAYS.map((day) => {
          const entry = draft.days[day];
          const label = t.booking[DAY_KEYS[day]];
          return (
            <div
              key={day}
              className="grid grid-cols-2 items-center gap-3 sm:grid-cols-3 sm:gap-4"
            >
              <div className="col-span-2 grid grid-cols-[3rem_1fr] items-center gap-3 sm:col-span-1">
                <span className="text-sm text-ink">{label}</span>
                <Select
                  aria-label={t.booking.dayModeLabel.replace('{day}', label)}
                  value={entry.mode}
                  onChange={(e) =>
                    updateDay(day, { mode: e.target.value as DayMode })
                  }
                >
                  <option value="default">{t.booking.dayDefault}</option>
                  <option value="custom">{t.booking.dayCustom}</option>
                  <option value="closed">{t.booking.dayClosedOption}</option>
                </Select>
              </div>
              {entry.mode === 'custom' && (
                <>
                  <Input
                    type="time"
                    step={900}
                    aria-label={t.booking.dayStartFor.replace('{day}', label)}
                    value={entry.start}
                    onChange={(e) => updateDay(day, { start: e.target.value })}
                  />
                  <Input
                    type="time"
                    step={900}
                    aria-label={t.booking.dayEndFor.replace('{day}', label)}
                    value={entry.end}
                    onChange={(e) => updateDay(day, { end: e.target.value })}
                  />
                </>
              )}
            </div>
          );
        })}
      </fieldset>

      {!input && <Banner tone="error">{t.booking.settingsInvalid}</Banner>}
      {save.isError && (
        <Banner tone="error">{errorText(save.error, t.errors.generic)}</Banner>
      )}
      {save.isSuccess && (
        <Banner tone="approved">{t.booking.settingsSaved}</Banner>
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="secondary"
          loading={save.isPending}
          disabled={!input}
        >
          {t.booking.saveSettings}
        </Button>
      </div>
    </form>
  );
}
