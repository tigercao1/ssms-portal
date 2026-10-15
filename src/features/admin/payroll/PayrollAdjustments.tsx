import { type FormEvent, useState } from 'react';
import { Banner, Button, Card, Field, Input, Select } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { useAdminInstructors } from '../api';
import {
  useAddPayrollAdjustment,
  useDeletePayrollAdjustment,
} from './payrollApi';
import { errorText, formatMoney, parseAmount } from './payrollFormat';
import type { PayrollPeriodDetail } from './types';

export function PayrollAdjustments({
  detail,
}: {
  detail: PayrollPeriodDetail;
}) {
  const t = useT();
  const { locale } = useLocale();
  const open = detail.period.status === 'open';
  const remove = useDeletePayrollAdjustment(detail.period.id);
  const names = new Map(
    detail.instructors.map((i) => [
      i.instructorId,
      localizeField(i.instructorName, i.instructorNameZh, locale),
    ]),
  );

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg">{t.payroll.adjustmentsTitle}</h2>
      {detail.adjustments.length === 0 ? (
        <p className="text-sm text-slate">{t.payroll.adjustmentsEmpty}</p>
      ) : (
        <ul className="divide-y divide-grey/40 text-sm">
          {detail.adjustments.map((adjustment) => (
            <li
              key={adjustment.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <div className="flex flex-col">
                <span className="font-medium text-ink">
                  {names.get(adjustment.instructorId) ||
                    adjustment.instructorName ||
                    '—'}
                </span>
                <span className="text-slate">{adjustment.description}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    adjustment.amount < 0
                      ? 'font-medium tabular-nums text-status-rejected'
                      : 'font-medium tabular-nums text-ink'
                  }
                >
                  {formatMoney(adjustment.amount, adjustment.currency, locale)}
                </span>
                {open && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    aria-label={t.payroll.adjustmentDeleteFor.replace(
                      '{description}',
                      adjustment.description,
                    )}
                    onClick={() => remove.mutate(adjustment.id)}
                  >
                    {t.common.remove}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {remove.isError && (
        <Banner tone="error">
          {errorText(remove.error, t.errors.generic)}
        </Banner>
      )}
      {open ? (
        <AdjustmentForm periodId={detail.period.id} />
      ) : (
        <p className="text-sm text-slate">{t.payroll.adjustmentsLocked}</p>
      )}
    </Card>
  );
}

function AdjustmentForm({ periodId }: { periodId: string }) {
  const t = useT();
  const { locale } = useLocale();
  const instructors = useAdminInstructors({});
  const add = useAddPayrollAdjustment(periodId);
  const [instructorId, setInstructorId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);

  const parsed = parseAmount(amount);
  const errors = {
    instructorId: instructorId ? undefined : t.validation.required,
    description: description.trim() ? undefined : t.validation.required,
    amount: parsed === null ? t.payroll.adjustmentAmountInvalid : undefined,
  };
  const options = (instructors.data ?? [])
    .map((i) => ({
      id: i.id,
      name: localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.instructorId || errors.description || parsed === null) return;
    add.mutate(
      { instructorId, description: description.trim(), amount: parsed },
      {
        onSuccess: () => {
          setDescription('');
          setAmount('');
          setTouched(false);
        },
      },
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-3 border-t border-grey/40 pt-4"
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_2fr_10rem]">
        <Field
          label={t.payroll.adjustmentInstructor}
          error={touched ? errors.instructorId : undefined}
        >
          {(p) => (
            <Select
              {...p}
              value={instructorId}
              onChange={(e) => {
                setInstructorId(e.target.value);
                add.reset();
              }}
            >
              <option value="">
                {t.payroll.adjustmentInstructorPlaceholder}
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t.payroll.adjustmentDescription}
          hint={t.payroll.adjustmentVisibleHint}
          error={touched ? errors.description : undefined}
        >
          {(p) => (
            <Input
              {...p}
              value={description}
              maxLength={500}
              onChange={(e) => {
                setDescription(e.target.value);
                add.reset();
              }}
            />
          )}
        </Field>
        <Field
          label={t.payroll.adjustmentAmount}
          hint={t.payroll.adjustmentAmountHint}
          error={touched ? errors.amount : undefined}
        >
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                add.reset();
              }}
            />
          )}
        </Field>
      </div>
      {add.isError && (
        <Banner tone="error">{errorText(add.error, t.errors.generic)}</Banner>
      )}
      {add.isSuccess && (
        <Banner tone="approved">{t.payroll.adjustmentAdded}</Banner>
      )}
      <div>
        <Button type="submit" variant="secondary" loading={add.isPending}>
          {t.payroll.adjustmentAdd}
        </Button>
      </div>
    </form>
  );
}
