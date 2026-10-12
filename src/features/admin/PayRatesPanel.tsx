import { Fragment, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import { Banner, Button, Field, Input, Select } from '@/components';
import type { AdminInstructorRecord, LessonType, PayRate } from '@/lib/types';
import { useCreatePayRate, useUpdatePayRate } from './lessonsApi';
import {
  dateInputValue,
  formatRate,
  parseRate,
  rateIsCurrent,
} from './lessonRules';

interface RateValues {
  hourlyRate: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
}

function rateErrors(v: RateValues, t: Messages) {
  return {
    hourlyRate:
      parseRate(v.hourlyRate) === 'invalid'
        ? t.lessonTypes.rateInvalid
        : undefined,
    currency: /^[A-Za-z]{3}$/.test(v.currency.trim())
      ? undefined
      : t.lessonTypes.currencyInvalid,
    effectiveFrom: v.effectiveFrom ? undefined : t.lessonTypes.dateRequired,
    effectiveTo:
      v.effectiveFrom && v.effectiveTo && v.effectiveTo < v.effectiveFrom
        ? t.lessonTypes.rangeInvalid
        : undefined,
  };
}

function hasErrors(errors: ReturnType<typeof rateErrors>) {
  return Object.values(errors).some(Boolean);
}

export function payRateError(err: unknown, t: Messages): string {
  if (err instanceof ApiError && err.status === 409) {
    return t.lessonTypes.rateOverlap;
  }
  return err instanceof ApiError ? err.message : t.errors.generic;
}

export function PayRatesPanel({
  lessonType,
  rates,
  instructors,
  instructorNames,
}: {
  lessonType: LessonType;
  rates: PayRate[];
  instructors: AdminInstructorRecord[];
  instructorNames: Map<string, string>;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [editing, setEditing] = useState<string | null>(null);
  const today = dateInputValue(new Date());
  const nameOf = (rate: PayRate) =>
    rate.instructorId
      ? (instructorNames.get(rate.instructorId) ?? rate.instructorId)
      : t.lessonTypes.defaultRate;
  const sorted = [...rates].sort(
    (a, b) =>
      Number(a.instructorId !== null) - Number(b.instructorId !== null) ||
      nameOf(a).localeCompare(nameOf(b)) ||
      b.effectiveFrom.localeCompare(a.effectiveFrom),
  );

  return (
    <section
      aria-label={t.lessonTypes.ratesFor.replace('{name}', lessonType.nameEn)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">
          {t.lessonTypes.ratesFor.replace('{name}', lessonType.nameEn)}
        </h2>
        <p className="text-sm text-slate">{t.lessonTypes.ratesIntro}</p>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate">{t.lessonTypes.ratesEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                <th className="px-3 py-2 font-medium">
                  {t.lessonTypes.colInstructor}
                </th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">
                  {t.lessonTypes.colRate}
                </th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">
                  {t.lessonTypes.colFrom}
                </th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">
                  {t.lessonTypes.colTo}
                </th>
                <th className="w-px px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((rate) => (
                <Fragment key={rate.id}>
                  <tr className="border-b border-grey/30 last:border-0">
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            rate.instructorId
                              ? 'text-ink'
                              : 'font-medium text-navy'
                          }
                        >
                          {nameOf(rate)}
                        </span>
                        {rateIsCurrent(rate, today) && (
                          <span className="rounded-sm bg-status-approved/10 px-2 py-0.5 text-xs text-ink">
                            {t.lessonTypes.current}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">
                      {formatRate(rate.hourlyRate, rate.currency, locale)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {rate.effectiveFrom}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {rate.effectiveTo ?? t.lessonTypes.openEnded}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={editing === rate.id}
                        aria-label={t.lessonTypes.editRateFor.replace(
                          '{name}',
                          nameOf(rate),
                        )}
                        onClick={() =>
                          setEditing((id) => (id === rate.id ? null : rate.id))
                        }
                      >
                        {t.common.edit}
                      </Button>
                    </td>
                  </tr>
                  {editing === rate.id && (
                    <tr>
                      <td colSpan={5} className="px-3 pb-4">
                        <EditRate
                          rate={rate}
                          name={nameOf(rate)}
                          onDone={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddRate lessonTypeId={lessonType.id} instructors={instructors} />
    </section>
  );
}

function RateFields({
  values,
  errors,
  onChange,
}: {
  values: RateValues;
  errors: Partial<Record<keyof RateValues, string>>;
  onChange: (next: RateValues) => void;
}) {
  const t = useT();
  const set = (key: keyof RateValues, value: string) =>
    onChange({ ...values, [key]: value });
  return (
    <>
      <Field label={t.lessonTypes.rateLabel} required error={errors.hourlyRate}>
        {(p) => (
          <Input
            {...p}
            inputMode="decimal"
            value={values.hourlyRate}
            onChange={(e) => set('hourlyRate', e.target.value)}
          />
        )}
      </Field>
      <Field label={t.lessonTypes.currencyLabel} error={errors.currency}>
        {(p) => (
          <Input
            {...p}
            maxLength={3}
            value={values.currency}
            onChange={(e) => set('currency', e.target.value)}
          />
        )}
      </Field>
      <Field
        label={t.lessonTypes.fromLabel}
        required
        error={errors.effectiveFrom}
      >
        {(p) => (
          <Input
            {...p}
            type="date"
            value={values.effectiveFrom}
            onChange={(e) => set('effectiveFrom', e.target.value)}
          />
        )}
      </Field>
      <Field
        label={t.lessonTypes.toLabel}
        hint={t.lessonTypes.toHint}
        error={errors.effectiveTo}
      >
        {(p) => (
          <Input
            {...p}
            type="date"
            value={values.effectiveTo}
            onChange={(e) => set('effectiveTo', e.target.value)}
          />
        )}
      </Field>
    </>
  );
}

function EditRate({
  rate,
  name,
  onDone,
}: {
  rate: PayRate;
  name: string;
  onDone: () => void;
}) {
  const t = useT();
  const update = useUpdatePayRate();
  const [values, setValues] = useState<RateValues>({
    hourlyRate: String(rate.hourlyRate),
    currency: rate.currency,
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo ?? '',
  });
  const errors = rateErrors(values, t);
  const hourlyRate = parseRate(values.hourlyRate);
  const currency = values.currency.trim().toUpperCase();
  const effectiveTo = values.effectiveTo || null;
  const changes = {
    ...(hourlyRate !== 'invalid' &&
      hourlyRate !== rate.hourlyRate && { hourlyRate }),
    ...(currency !== rate.currency && { currency }),
    ...(values.effectiveFrom !== rate.effectiveFrom && {
      effectiveFrom: values.effectiveFrom,
    }),
    ...(effectiveTo !== rate.effectiveTo && { effectiveTo }),
  };
  const dirty = Object.keys(changes).length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || hasErrors(errors) || update.isPending) return;
    update.mutate({ id: rate.id, ...changes }, { onSuccess: onDone });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-md border border-grey/60 bg-sunken p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-navy">
          {t.lessonTypes.editRateTitle.replace('{name}', name)}
        </h3>
        <p className="text-xs text-slate">{t.lessonTypes.instructorFixed}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <RateFields
          values={values}
          errors={errors}
          onChange={(next) => {
            setValues(next);
            update.reset();
          }}
        />
      </div>
      {update.isError && (
        <Banner tone="error">{payRateError(update.error, t)}</Banner>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDone}
          disabled={update.isPending}
        >
          {t.common.cancel}
        </Button>
        <Button
          type="submit"
          size="sm"
          loading={update.isPending}
          disabled={!dirty || hasErrors(errors)}
        >
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}

const EMPTY_RATE: RateValues = {
  hourlyRate: '',
  currency: 'CAD',
  effectiveFrom: '',
  effectiveTo: '',
};

function AddRate({
  lessonTypeId,
  instructors,
}: {
  lessonTypeId: string;
  instructors: AdminInstructorRecord[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const create = useCreatePayRate();
  const [instructorId, setInstructorId] = useState('');
  const [values, setValues] = useState<RateValues>(EMPTY_RATE);
  const [touched, setTouched] = useState(false);
  const errors = rateErrors(values, t);
  const options = instructors
    .map((i) => ({
      id: i.id,
      name:
        (locale === 'zh-CN' && i.displayNameZh) || i.displayNameEn || i.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const hourlyRate = parseRate(values.hourlyRate);
    if (hasErrors(errors) || hourlyRate === 'invalid' || create.isPending) {
      return;
    }
    create.mutate(
      {
        lessonTypeId,
        instructorId: instructorId || null,
        hourlyRate,
        currency: values.currency.trim().toUpperCase(),
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo || null,
      },
      {
        onSuccess: () => {
          setValues(EMPTY_RATE);
          setInstructorId('');
          setTouched(false);
        },
      },
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 border-t border-grey/40 pt-4"
    >
      <h3 className="font-medium text-navy">{t.lessonTypes.addRate}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field label={t.lessonTypes.instructorLabel}>
          {(p) => (
            <Select
              {...p}
              value={instructorId}
              onChange={(e) => {
                setInstructorId(e.target.value);
                create.reset();
              }}
            >
              <option value="">{t.lessonTypes.defaultRate}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <RateFields
          values={values}
          errors={touched ? errors : {}}
          onChange={(next) => {
            setValues(next);
            create.reset();
          }}
        />
      </div>
      {create.isError && (
        <Banner tone="error">{payRateError(create.error, t)}</Banner>
      )}
      {create.isSuccess && (
        <Banner tone="approved">{t.lessonTypes.rateAdded}</Banner>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" loading={create.isPending}>
          {t.lessonTypes.addRate}
        </Button>
      </div>
    </form>
  );
}
