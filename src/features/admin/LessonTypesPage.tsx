import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  ActionsMenu,
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Spinner,
  Toggle,
} from '@/components';
import type { LessonType, LessonTypeInput, PayRate } from '@/lib/types';
import { useAdminInstructors } from './api';
import {
  useCreateLessonType,
  useLessonTypes,
  usePayRates,
  useUpdateLessonType,
} from './lessonsApi';
import { parsePositiveInt } from './lessonRules';
import { PayRatesPanel } from './PayRatesPanel';

type Expanded = { id: string; mode: 'edit' | 'rates' } | null;

export function LessonTypesPage() {
  const t = useT();
  const { locale } = useLocale();
  const types = useLessonTypes();
  const rates = usePayRates();
  const instructors = useAdminInstructors({});
  const [expanded, setExpanded] = useState<Expanded>(null);

  const ratesByType = new Map<string, PayRate[]>();
  for (const rate of rates.data ?? []) {
    const list = ratesByType.get(rate.lessonTypeId) ?? [];
    list.push(rate);
    ratesByType.set(rate.lessonTypeId, list);
  }
  const instructorNames = new Map(
    (instructors.data ?? []).map((i) => [
      i.id,
      localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email,
    ]),
  );
  const rows = [...(types.data ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn),
  );

  function toggle(id: string, mode: 'edit' | 'rates') {
    setExpanded((current) =>
      current?.id === id && current.mode === mode ? null : { id, mode },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">{t.lessonTypes.title}</h1>
        <p className="max-w-3xl text-slate">{t.lessonTypes.intro}</p>
      </div>

      {types.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : types.isError ? (
        <Banner tone="error">{errorText(types.error, t.errors.generic)}</Banner>
      ) : rows.length === 0 ? (
        <EmptyState title={t.lessonTypes.empty} />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                  <th className="px-4 py-2 font-medium">
                    {t.lessonTypes.colNameEn}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t.lessonTypes.colNameZh}
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-2 font-medium">
                    {t.lessonTypes.colGroupSize}
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-2 font-medium">
                    {t.lessonTypes.colDuration}
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-2 font-medium">
                    {t.lessonTypes.colStatus}
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-2 text-right font-medium">
                    {t.admin.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const open = expanded?.id === row.id ? expanded.mode : null;
                  const typeRates = ratesByType.get(row.id) ?? [];
                  return (
                    <Fragment key={row.id}>
                      <tr
                        aria-current={open ? true : undefined}
                        className={cn(
                          open
                            ? 'bg-navy-tint shadow-[inset_3px_0_0_var(--navy)]'
                            : i % 2 === 1 && 'bg-sunken',
                          !row.active && 'text-slate',
                        )}
                      >
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={row.active ? 'text-ink' : ''}>
                              {row.nameEn}
                            </span>
                            {row.isPromo && <PromoBadge />}
                          </div>
                        </td>
                        <td className="px-4 py-2">{row.nameZh || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-2">
                          {row.groupSize ?? t.lessonTypes.anySize}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          {t.lessonTypes.minutes.replace(
                            '{n}',
                            String(row.durationMin),
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <ActiveStatus active={row.active} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <div className="flex justify-end">
                            <ActionsMenu
                              label={t.common.moreActionsFor.replace(
                                '{name}',
                                row.nameEn,
                              )}
                              items={[
                                {
                                  key: 'edit',
                                  label: t.common.edit,
                                  ariaLabel: t.lessonTypes.editFor.replace(
                                    '{name}',
                                    row.nameEn,
                                  ),
                                  onSelect: () => toggle(row.id, 'edit'),
                                },
                                {
                                  key: 'rates',
                                  label: t.lessonTypes.ratesButton.replace(
                                    '{count}',
                                    String(typeRates.length),
                                  ),
                                  ariaLabel: t.lessonTypes.ratesFor.replace(
                                    '{name}',
                                    row.nameEn,
                                  ),
                                  onSelect: () => toggle(row.id, 'rates'),
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <ExpandedRow>
                          {open === 'edit' ? (
                            <EditLessonType
                              row={row}
                              onDone={() => setExpanded(null)}
                            />
                          ) : (
                            <PayRatesPanel
                              lessonType={row}
                              rates={typeRates}
                              instructors={instructors.data ?? []}
                              instructorNames={instructorNames}
                            />
                          )}
                        </ExpandedRow>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AddLessonType />
    </div>
  );
}

function ExpandedRow({ children }: { children: ReactNode }) {
  return (
    <tr className="bg-navy-tint shadow-[inset_3px_0_0_var(--navy)]">
      <td colSpan={6} className="px-4 pb-4 pt-1">
        <div className="flex flex-col gap-4 rounded-md border border-grey/60 bg-surface p-4 shadow-card sm:p-5">
          {children}
        </div>
      </td>
    </tr>
  );
}

export function PromoBadge() {
  const t = useT();
  return (
    <span className="whitespace-nowrap rounded-sm bg-red-tint px-2 py-0.5 text-xs font-medium text-red">
      {t.lessonTypes.promo}
    </span>
  );
}

function ActiveStatus({ active }: { active: boolean }) {
  const t = useT();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border-l-[3px] bg-sunken px-2 py-0.5 text-xs font-medium',
        active ? 'border-status-approved text-ink' : 'border-grey text-slate',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          active ? 'bg-status-approved' : 'bg-grey',
        )}
        aria-hidden
      />
      {active ? t.lessonTypes.active : t.lessonTypes.inactive}
    </span>
  );
}

export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

interface FormValues {
  nameEn: string;
  nameZh: string;
  groupSize: string;
  durationMin: string;
  sortOrder: string;
  isPromo: boolean;
  active: boolean;
}

const EMPTY: FormValues = {
  nameEn: '',
  nameZh: '',
  groupSize: '',
  durationMin: '',
  sortOrder: '0',
  isPromo: false,
  active: true,
};

function toValues(row: LessonType): FormValues {
  return {
    nameEn: row.nameEn,
    nameZh: row.nameZh ?? '',
    groupSize: row.groupSize === null ? '' : String(row.groupSize),
    durationMin: String(row.durationMin),
    sortOrder: String(row.sortOrder),
    isPromo: row.isPromo,
    active: row.active,
  };
}

function parseValues(v: FormValues) {
  const groupSize = parsePositiveInt(v.groupSize);
  const duration = parsePositiveInt(v.durationMin);
  return {
    groupSizeInvalid:
      groupSize === 'invalid' || (groupSize !== null && groupSize > 100),
    durationInvalid:
      duration === null || duration === 'invalid' || duration > 1440,
    input: {
      nameEn: v.nameEn.trim(),
      nameZh: v.nameZh.trim() || null,
      groupSize: typeof groupSize === 'number' ? groupSize : null,
      durationMin: typeof duration === 'number' ? duration : 0,
      isPromo: v.isPromo,
      active: v.active,
      sortOrder: Number.parseInt(v.sortOrder, 10) || 0,
    } satisfies Required<LessonTypeInput>,
  };
}

function LessonTypeFields({
  values,
  onChange,
  nameError,
  showErrors,
}: {
  values: FormValues;
  onChange: (next: FormValues) => void;
  nameError?: string;
  showErrors: boolean;
}) {
  const t = useT();
  const parsed = parseValues(values);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    onChange({ ...values, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.lessonTypes.nameEnLabel} required error={nameError}>
        {(p) => (
          <Input
            {...p}
            value={values.nameEn}
            onChange={(e) => set('nameEn', e.target.value)}
          />
        )}
      </Field>
      <Field label={t.lessonTypes.nameZhLabel}>
        {(p) => (
          <Input
            {...p}
            value={values.nameZh}
            onChange={(e) => set('nameZh', e.target.value)}
          />
        )}
      </Field>
      <Field
        label={t.lessonTypes.groupSizeLabel}
        hint={t.lessonTypes.groupSizeHint}
        error={
          showErrors && parsed.groupSizeInvalid
            ? t.lessonTypes.groupSizeInvalid
            : undefined
        }
      >
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            value={values.groupSize}
            onChange={(e) => set('groupSize', e.target.value)}
          />
        )}
      </Field>
      <Field
        label={t.lessonTypes.durationLabel}
        required
        error={
          showErrors && parsed.durationInvalid
            ? t.lessonTypes.durationInvalid
            : undefined
        }
      >
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            value={values.durationMin}
            onChange={(e) => set('durationMin', e.target.value)}
          />
        )}
      </Field>
      <Field label={t.lessonTypes.sortOrderLabel}>
        {(p) => (
          <Input
            {...p}
            type="number"
            value={values.sortOrder}
            onChange={(e) => set('sortOrder', e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-6 sm:mt-7">
        <span className="flex items-center gap-2">
          <Toggle
            checked={values.isPromo}
            onChange={(next) => set('isPromo', next)}
            label={t.lessonTypes.promoLabel}
          />
          <span className="text-sm text-slate">{t.lessonTypes.promoLabel}</span>
        </span>
        <span className="flex items-center gap-2">
          <Toggle
            checked={values.active}
            onChange={(next) => set('active', next)}
            label={t.lessonTypes.activeLabel}
          />
          <span className="text-sm text-slate">
            {t.lessonTypes.activeLabel}
          </span>
        </span>
      </div>
    </div>
  );
}

function isNameTaken(err: unknown) {
  return err instanceof ApiError && err.status === 409;
}

function EditLessonType({
  row,
  onDone,
}: {
  row: LessonType;
  onDone: () => void;
}) {
  const t = useT();
  const update = useUpdateLessonType();
  const [values, setValues] = useState(() => toValues(row));
  const parsed = parseValues(values);
  const before = parseValues(toValues(row)).input;
  const changes = Object.fromEntries(
    (Object.keys(parsed.input) as (keyof typeof parsed.input)[])
      .filter((key) => parsed.input[key] !== before[key])
      .map((key) => [key, parsed.input[key]]),
  ) as LessonTypeInput;
  const invalid =
    !parsed.input.nameEn || parsed.groupSizeInvalid || parsed.durationInvalid;
  const dirty = Object.keys(changes).length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || invalid || update.isPending) return;
    update.mutate({ id: row.id, ...changes }, { onSuccess: onDone });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !update.isPending) onDone();
      }}
    >
      <h2 className="text-lg">{t.lessonTypes.editTitle}</h2>
      <LessonTypeFields
        values={values}
        onChange={(next) => {
          setValues(next);
          update.reset();
        }}
        nameError={
          isNameTaken(update.error) ? t.lessonTypes.nameTaken : undefined
        }
        showErrors
      />
      {update.isError && !isNameTaken(update.error) && (
        <Banner tone="error">
          {errorText(update.error, t.errors.generic)}
        </Banner>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          disabled={update.isPending}
        >
          {t.common.cancel}
        </Button>
        <Button
          type="submit"
          loading={update.isPending}
          disabled={!dirty || invalid}
        >
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}

function AddLessonType() {
  const t = useT();
  const create = useCreateLessonType();
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  const parsed = parseValues(values);
  const invalid =
    !parsed.input.nameEn || parsed.groupSizeInvalid || parsed.durationInvalid;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (invalid || create.isPending) return;
    create.mutate(parsed.input, {
      onSuccess: () => {
        setValues(EMPTY);
        setTouched(false);
      },
    });
  }

  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <h2 className="text-lg">{t.lessonTypes.addTitle}</h2>
        <LessonTypeFields
          values={values}
          onChange={(next) => {
            setValues(next);
            create.reset();
          }}
          nameError={
            isNameTaken(create.error) ? t.lessonTypes.nameTaken : undefined
          }
          showErrors={touched}
        />
        {create.isError && !isNameTaken(create.error) && (
          <Banner tone="error">
            {errorText(create.error, t.errors.generic)}
          </Banner>
        )}
        {create.isSuccess && (
          <Banner tone="approved">{t.lessonTypes.added}</Banner>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            loading={create.isPending}
            disabled={!values.nameEn.trim()}
          >
            {t.common.add}
          </Button>
        </div>
      </form>
    </Card>
  );
}
