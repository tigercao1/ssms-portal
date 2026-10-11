import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import type { Messages } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Select,
  Spinner,
  Toggle,
} from '@/components';
import type {
  AdminInstructorRecord,
  LessonProduct,
  LessonProductPatch,
  LessonProductStatus,
  LessonProductSyncResult,
  LessonType,
} from '@/lib/types';
import { useAdminInstructors } from './api';
import {
  useConfirmLessonProducts,
  useLessonProducts,
  useSyncLessonProducts,
  useUpdateLessonProduct,
} from './lessonsApi';
import { formatPrice, looksComplete, parsePositiveInt } from './lessonRules';

type LessonsKey = Exclude<keyof Messages['lessons'], 'syncCounters'>;

const TABS: { status: LessonProductStatus; labelKey: LessonsKey }[] = [
  { status: 'suggested', labelKey: 'tabSuggested' },
  { status: 'confirmed', labelKey: 'tabConfirmed' },
  { status: 'ignored', labelKey: 'tabIgnored' },
];

const EMPTY_KEYS: Record<LessonProductStatus, LessonsKey> = {
  suggested: 'emptySuggested',
  confirmed: 'emptyConfirmed',
  ignored: 'emptyIgnored',
};

const LESSON_TYPES: { value: LessonType; labelKey: LessonsKey }[] = [
  { value: 'private', labelKey: 'typePrivate' },
  { value: 'semi_private', labelKey: 'typeSemiPrivate' },
  { value: 'group', labelKey: 'typeGroup' },
  { value: 'other', labelKey: 'typeOther' },
];

const SYNC_COUNTERS = [
  'fetched',
  'created',
  'updated',
  'unchanged',
  'skipped',
] as const;

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function productName(p: LessonProduct) {
  return p.variantTitle
    ? `${p.productTitle} · ${p.variantTitle}`
    : p.productTitle;
}

export function LessonProductsPage() {
  const t = useT();
  const [status, setStatus] = useState<LessonProductStatus>('suggested');
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">{t.lessons.productsTitle}</h1>
        <p className="text-sm text-slate">{t.lessons.productsIntro}</p>
      </div>

      <SyncCard />

      <div
        role="tablist"
        aria-label={t.lessons.productsTitle}
        className="flex flex-wrap gap-1 border-b border-grey/60"
      >
        {TABS.map((tab) => (
          <button
            key={tab.status}
            role="tab"
            aria-selected={status === tab.status}
            onClick={() => {
              setStatus(tab.status);
              setEditingId(null);
            }}
            className={cn(
              'border-b-2 px-3 py-2 text-sm transition-colors',
              status === tab.status
                ? 'border-red font-medium text-navy'
                : 'border-transparent text-slate hover:text-navy',
            )}
          >
            {t.lessons[tab.labelKey]}
          </button>
        ))}
      </div>

      <ProductsTable
        key={status}
        status={status}
        editingId={editingId}
        onEdit={setEditingId}
        onDoneEditing={() => setEditingId(null)}
      />
    </div>
  );
}

function SyncCard() {
  const t = useT();
  const sync = useSyncLessonProducts();

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-lg">{t.lessons.syncTitle}</h2>
          <p className="text-sm text-slate">{t.lessons.syncBody}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => sync.mutate()}
          loading={sync.isPending}
        >
          {t.lessons.sync}
        </Button>
      </div>
      {sync.isError && (
        <Banner tone="error" title={t.lessons.syncFailed}>
          {errorText(sync.error, t.errors.generic)}
        </Banner>
      )}
      {sync.isSuccess && <SyncResult result={sync.data} />}
    </Card>
  );
}

function SyncResult({ result }: { result: LessonProductSyncResult }) {
  const t = useT();
  const counters = SYNC_COUNTERS.filter((k) => typeof result?.[k] === 'number');
  return (
    <Banner tone="approved" title={t.lessons.syncDone}>
      {counters.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {counters.map((k) => (
            <li key={k}>
              {t.lessons.syncCounters[k]}:{' '}
              <span className="font-mono">{String(result[k])}</span>
            </li>
          ))}
        </ul>
      )}
    </Banner>
  );
}

function useInstructorNames() {
  const { locale } = useLocale();
  const instructors = useAdminInstructors({});
  const list = instructors.data ?? [];
  const nameOf = (i: AdminInstructorRecord) =>
    localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email;
  const byId = new Map(list.map((i) => [i.id, nameOf(i)]));
  const options = list
    .map((i) => ({ id: i.id, name: nameOf(i) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { byId, options };
}

function ProductsTable({
  status,
  editingId,
  onEdit,
  onDoneEditing,
}: {
  status: LessonProductStatus;
  editingId: string | null;
  onEdit: (id: string) => void;
  onDoneEditing: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const rows = useLessonProducts(status);
  const instructors = useInstructorNames();
  const update = useUpdateLessonProduct();
  const [actingOn, setActingOn] = useState<string | null>(null);
  const returnFocusTo = useRef<string | null>(null);

  useEffect(() => {
    if (editingId || !returnFocusTo.current) return;
    const id = returnFocusTo.current;
    returnFocusTo.current = null;
    document.getElementById(editTriggerId(id))?.focus();
  }, [editingId]);

  function doneEditing() {
    if (editingId) returnFocusTo.current = editingId;
    onDoneEditing();
  }

  function setRowStatus(id: string, next: LessonProductStatus) {
    setActingOn(id);
    update.mutate(
      { id, status: next },
      {
        onSuccess: () => {
          if (editingId === id) onDoneEditing();
        },
        onSettled: () => setActingOn(null),
      },
    );
  }

  const data = rows.data ?? [];
  const typeLabel = (type: LessonType) =>
    t.lessons[
      LESSON_TYPES.find((lt) => lt.value === type)?.labelKey ?? 'typeOther'
    ];

  return (
    <div className="flex flex-col gap-4">
      {status === 'suggested' && <BulkConfirm rows={data} />}
      {update.isError && !editingId && (
        <Banner tone="error">
          {errorText(update.error, t.errors.generic)}
        </Banner>
      )}
      <Card className="p-0">
        {rows.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : rows.isError ? (
          <div className="p-4">
            <Banner tone="error">
              {errorText(rows.error, t.errors.generic)}
            </Banner>
          </div>
        ) : data.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate">
            {t.lessons[EMPTY_KEYS[status]]}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                  <th className="min-w-[10rem] px-4 py-2 font-medium">
                    {t.lessons.colProduct}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">
                    {t.lessons.colPrice}
                  </th>
                  <th className="min-w-[12rem] px-4 py-2 font-medium">
                    {t.lessons.colLesson}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">
                    {t.lessons.colInstructor}
                  </th>
                  <th className="w-px whitespace-nowrap px-4 py-2 text-right font-medium">
                    {t.admin.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((p, i) => {
                  const selected = p.id === editingId;
                  const name = productName(p);
                  return (
                    <Fragment key={p.id}>
                      <tr
                        aria-current={selected || undefined}
                        className={cn(
                          selected
                            ? 'bg-navy-tint shadow-[inset_3px_0_0_var(--navy)]'
                            : i % 2 === 1 && 'bg-sunken',
                        )}
                      >
                        <td className="px-4 py-2 text-ink">
                          <div className="flex flex-col">
                            <span>{p.productTitle}</span>
                            {p.variantTitle && (
                              <span className="text-xs text-slate">
                                {p.variantTitle}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <div className="flex flex-col">
                            <span>
                              {formatPrice(p.price, p.currency, locale) || '—'}
                            </span>
                            {p.pricedPerStudent && (
                              <span className="text-xs text-slate">
                                {t.lessons.perStudent}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col">
                            <span>{typeLabel(p.lessonType)}</span>
                            <span className="text-xs text-slate">
                              {lessonDetails(p, t.lessons)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {p.instructorId
                            ? (instructors.byId.get(p.instructorId) ?? '—')
                            : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <div className="flex justify-end gap-2">
                            <Button
                              id={editTriggerId(p.id)}
                              size="sm"
                              variant="secondary"
                              aria-expanded={selected}
                              aria-controls={editPanelId(p.id)}
                              aria-label={t.lessons.editFor.replace(
                                '{name}',
                                name,
                              )}
                              onClick={() => onEdit(p.id)}
                            >
                              {t.common.edit}
                            </Button>
                            {p.status !== 'confirmed' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={t.lessons.confirmFor.replace(
                                  '{name}',
                                  name,
                                )}
                                loading={actingOn === p.id}
                                disabled={actingOn !== null}
                                onClick={() => setRowStatus(p.id, 'confirmed')}
                              >
                                {t.lessons.confirm}
                              </Button>
                            )}
                            {p.status !== 'ignored' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={t.lessons.ignoreFor.replace(
                                  '{name}',
                                  name,
                                )}
                                disabled={actingOn !== null}
                                onClick={() => setRowStatus(p.id, 'ignored')}
                              >
                                {t.lessons.ignore}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {selected && (
                        <EditRow
                          key={p.id}
                          row={p}
                          instructors={instructors.options}
                          onDone={doneEditing}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function editPanelId(id: string) {
  return `lesson-edit-${id}`;
}

function editTriggerId(id: string) {
  return `lesson-edit-trigger-${id}`;
}

function BulkConfirm({ rows }: { rows: LessonProduct[] }) {
  const t = useT();
  const confirmAll = useConfirmLessonProducts();
  const [asking, setAsking] = useState(false);
  const complete = rows.filter(looksComplete);
  const count = complete.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={count === 0 || asking || confirmAll.isPending}
          onClick={() => {
            confirmAll.reset();
            setAsking(true);
          }}
        >
          {t.lessons.bulkConfirm}
        </Button>
        <span className="text-sm text-slate">
          {count === 0
            ? t.lessons.bulkNone
            : t.lessons.bulkReady.replace('{count}', String(count))}
        </span>
      </div>
      {asking && (
        <div
          role="alertdialog"
          aria-labelledby="bulk-confirm-title"
          aria-describedby="bulk-confirm-body"
          className="flex flex-col gap-3 rounded-md border-l-[3px] border-l-navy bg-navy-tint px-4 py-3 text-sm text-ink"
        >
          <p id="bulk-confirm-title" className="font-semibold">
            {t.lessons.bulkTitle.replace('{count}', String(count))}
          </p>
          <p id="bulk-confirm-body">{t.lessons.bulkBody}</p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={confirmAll.isPending}
              onClick={() => setAsking(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              loading={confirmAll.isPending}
              onClick={() =>
                confirmAll.mutate(
                  complete.map((p) => p.id),
                  { onSettled: () => setAsking(false) },
                )
              }
            >
              {t.lessons.bulkGo.replace('{count}', String(count))}
            </Button>
          </div>
        </div>
      )}
      {confirmAll.isSuccess && (
        <Banner tone="approved">
          {t.lessons.bulkDone.replace('{count}', String(confirmAll.data))}
        </Banner>
      )}
      {confirmAll.isError && (
        <Banner tone="error">
          {errorText(confirmAll.error, t.errors.generic)}
        </Banner>
      )}
    </div>
  );
}

function EditRow({
  row,
  instructors,
  onDone,
}: {
  row: LessonProduct;
  instructors: { id: string; name: string }[];
  onDone: () => void;
}) {
  const t = useT();
  const update = useUpdateLessonProduct();
  const rowRef = useRef<HTMLTableRowElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const [lessonType, setLessonType] = useState<LessonType>(row.lessonType);
  const [groupSize, setGroupSize] = useState(numText(row.groupSize));
  const [sessions, setSessions] = useState(numText(row.sessions));
  const [durationMin, setDurationMin] = useState(numText(row.durationMin));
  const [instructorId, setInstructorId] = useState(row.instructorId ?? '');
  const [pricedPerStudent, setPricedPerStudent] = useState(
    row.pricedPerStudent,
  );

  useEffect(() => {
    typeRef.current?.focus({ preventScroll: true });
    rowRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const parsed = {
    groupSize: parsePositiveInt(groupSize),
    sessions: parsePositiveInt(sessions),
    durationMin: parsePositiveInt(durationMin),
  };
  const invalid = (v: number | null | 'invalid') =>
    v === 'invalid' ? t.lessons.numberInvalid : undefined;
  const hasInvalid = Object.values(parsed).some((v) => v === 'invalid');

  const changes: LessonProductPatch = {};
  if (lessonType !== row.lessonType) changes.lessonType = lessonType;
  if (parsed.groupSize !== 'invalid' && parsed.groupSize !== row.groupSize)
    changes.groupSize = parsed.groupSize;
  if (parsed.sessions !== 'invalid' && parsed.sessions !== row.sessions)
    changes.sessions = parsed.sessions;
  if (
    parsed.durationMin !== 'invalid' &&
    parsed.durationMin !== row.durationMin
  )
    changes.durationMin = parsed.durationMin;
  if ((instructorId || null) !== row.instructorId)
    changes.instructorId = instructorId || null;
  if (pricedPerStudent !== row.pricedPerStudent)
    changes.pricedPerStudent = pricedPerStudent;
  const dirty = Object.keys(changes).length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || hasInvalid || update.isPending) return;
    update.mutate({ id: row.id, ...changes }, { onSuccess: onDone });
  }

  return (
    <tr
      ref={rowRef}
      id={editPanelId(row.id)}
      className="scroll-my-6 bg-navy-tint shadow-[inset_3px_0_0_var(--navy)]"
    >
      <td
        colSpan={5}
        className="px-4 pb-4 pt-1"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !update.isPending) onDone();
        }}
      >
        <div className="flex flex-col gap-4 rounded-md border border-grey/60 bg-surface p-4 shadow-card sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg">{t.lessons.editTitle}</h2>
            <p className="text-sm text-slate">{productName(row)}</p>
          </div>
          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t.lessons.typeLabel}>
                {(p) => (
                  <Select
                    {...p}
                    ref={typeRef}
                    value={lessonType}
                    onChange={(e) =>
                      setLessonType(e.target.value as LessonType)
                    }
                  >
                    {LESSON_TYPES.map((lt) => (
                      <option key={lt.value} value={lt.value}>
                        {t.lessons[lt.labelKey]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                label={t.lessons.sizeLabel}
                error={invalid(parsed.groupSize)}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={groupSize}
                    onChange={(e) => setGroupSize(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t.lessons.sessionsLabel}
                error={invalid(parsed.sessions)}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={sessions}
                    onChange={(e) => setSessions(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t.lessons.durationLabel}
                error={invalid(parsed.durationMin)}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t.lessons.instructorLabel}>
                {(p) => (
                  <Select
                    {...p}
                    value={instructorId}
                    onChange={(e) => setInstructorId(e.target.value)}
                  >
                    <option value="">{t.lessons.noInstructor}</option>
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="flex items-center gap-2 sm:mt-7">
                <Toggle
                  checked={pricedPerStudent}
                  onChange={setPricedPerStudent}
                  label={t.lessons.pricedPerStudentLabel}
                />
                <span className="text-sm text-slate">
                  {t.lessons.pricedPerStudentLabel}
                </span>
              </div>
            </div>
            {update.isError && (
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
                disabled={!dirty || hasInvalid}
              >
                {t.common.save}
              </Button>
            </div>
          </form>
        </div>
      </td>
    </tr>
  );
}

function lessonDetails(p: LessonProduct, t: Messages['lessons']) {
  const dash = '—';
  return [
    `${t.colSize} ${p.groupSize ?? dash}`,
    `${t.colSessions} ${p.sessions ?? dash}`,
    p.durationMin ? t.minutes.replace('{n}', String(p.durationMin)) : dash,
  ].join(' · ');
}

function numText(n: number | null) {
  return n == null ? '' : String(n);
}
