import { useId, useRef, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import {
  Banner,
  Button,
  Card,
  Input,
  Select,
  Spinner,
  Toggle,
} from '@/components';
import { errorText } from '../LessonTypesPage';
import {
  draftMinutes,
  MAX_REMINDERS,
  reminderErrors,
  toReminderDraft,
  torontoDateTime,
  useReminderSettings,
  useSaveReminderSettings,
  type ReminderDraft,
  type ReminderSettings,
  type ReminderUnit,
} from './reminderSettings';

export function ReminderSettingsCard() {
  const t = useT();
  const titleId = useId();
  const settings = useReminderSettings();
  return (
    <Card>
      <section aria-labelledby={titleId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg">
            {t.bookingReminders.title}
          </h2>
          <p className="text-sm text-slate">{t.bookingReminders.body}</p>
        </div>
        {settings.isLoading ? (
          <Spinner />
        ) : settings.isError || !settings.data ? (
          <Banner tone="error">
            {errorText(settings.error, t.errors.generic)}
          </Banner>
        ) : (
          <ReminderForm settings={settings.data} />
        )}
      </section>
    </Card>
  );
}

function ReminderForm({ settings }: { settings: ReminderSettings }) {
  const t = useT();
  const { locale } = useLocale();
  const save = useSaveReminderSettings();
  const nextId = useRef(0);
  const draftsOf = (offsets: number[]) =>
    offsets.map((minutes) => toReminderDraft(minutes, nextId.current++));
  const [enabled, setEnabled] = useState(settings.enabled);
  const [rows, setRows] = useState<ReminderDraft[]>(() =>
    draftsOf(settings.offsetsMinutes),
  );
  const minutes = rows.map(draftMinutes);
  const offsets = minutes.filter((m): m is number => m !== null);
  const invalid = offsets.length !== minutes.length;
  const [showInvalid, setShowInvalid] = useState(false);

  const change = (next: ReminderDraft[]) => {
    save.reset();
    setShowInvalid(false);
    setRows(next);
  };
  const updateRow = (id: number, patch: Partial<ReminderDraft>) =>
    change(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) {
      setShowInvalid(true);
      return;
    }
    save.mutate(
      { enabled, offsetsMinutes: offsets },
      {
        onSuccess: (saved) => {
          setEnabled(saved.enabled);
          setRows(draftsOf(saved.offsetsMinutes));
        },
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Toggle
          checked={enabled}
          label={t.bookingReminders.enabledLabel}
          onChange={(next) => {
            save.reset();
            setEnabled(next);
          }}
        />
        <span className="text-sm text-ink">
          {t.bookingReminders.enabledLabel}
        </span>
        <span data-testid="reminders-status" className="text-sm text-slate">
          {settings.enabled
            ? t.bookingReminders.onSince.replace(
                '{date}',
                torontoDateTime(settings.enabledAt, locale),
              )
            : t.bookingReminders.off}
        </span>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-navy">
          {t.bookingReminders.timesLabel}
        </legend>
        <p className="text-xs text-slate">{t.bookingReminders.timesHint}</p>
        {rows.length === 0 && (
          <p className="text-sm text-slate">{t.bookingReminders.empty}</p>
        )}
        {rows.map((row, index) => {
          const n = String(index + 1);
          return (
            <div
              key={row.id}
              className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2 sm:max-w-md"
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                aria-label={t.bookingReminders.amountFor.replace('{n}', n)}
                aria-invalid={minutes[index] === null}
                value={row.amount}
                onChange={(e) => updateRow(row.id, { amount: e.target.value })}
              />
              <Select
                aria-label={t.bookingReminders.unitFor.replace('{n}', n)}
                value={row.unit}
                onChange={(e) =>
                  updateRow(row.id, { unit: e.target.value as ReminderUnit })
                }
              >
                <option value="minutes">
                  {t.bookingReminders.unitMinutes}
                </option>
                <option value="hours">{t.bookingReminders.unitHours}</option>
                <option value="days">{t.bookingReminders.unitDays}</option>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t.bookingReminders.removeFor.replace('{n}', n)}
                onClick={() => change(rows.filter((r) => r.id !== row.id))}
              >
                {t.common.remove}
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          className="self-start"
          variant="ghost"
          size="sm"
          disabled={rows.length >= MAX_REMINDERS}
          onClick={() =>
            change([
              ...rows,
              { id: nextId.current++, amount: '', unit: 'hours' },
            ])
          }
        >
          {t.bookingReminders.add}
        </Button>
      </fieldset>

      {invalid && showInvalid && (
        <Banner tone="error">{t.bookingReminders.wholeNumber}</Banner>
      )}
      {save.isError && (
        <Banner tone="error">
          {reminderErrors(save.error, t).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </Banner>
      )}
      {save.isSuccess && (
        <Banner tone="approved">{t.bookingReminders.saved}</Banner>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" loading={save.isPending}>
          {t.bookingReminders.save}
        </Button>
      </div>
    </form>
  );
}
