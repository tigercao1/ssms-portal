import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Locale, Messages } from '@/i18n/core/types';
import { localizeField } from '@/i18n/core/localize';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Pager,
  Select,
  Spinner,
} from '@/components';
import type { AdminInstructorRecord, LessonType } from '@/lib/types';
import { useAdminInstructors } from '../api';
import { useCustomerSearch } from '../customersApi';
import { useLessonTypes } from '../lessonsApi';
import { customerName } from '../lessonRules';
import { errorText } from '../LessonTypesPage';
import {
  IMPORT_ROWS_PAGE_SIZE,
  useClassImport,
  useClassImports,
  useCommitClassImport,
  useDiscardClassImport,
  useSaveEventMap,
  useUpdateImportRow,
  useUploadClassImport,
} from './importApi';
import type {
  ClassImport,
  ClassImportDetail,
  ClassImportRow,
  ImportProblem,
  ImportRowPatch,
  ImportRowStatus,
  ImportStatus,
  ImportSummary,
  RowFilter,
} from './importTypes';

type Copy = Messages['classImport'];
type CopyKey = keyof Copy;

export const SCHOOL_TIME_ZONE = 'America/Toronto';

const PROBLEM_KEYS: Record<ImportProblem, CopyKey> = {
  instructor_not_found: 'problemInstructorNotFound',
  instructor_ambiguous: 'problemInstructorAmbiguous',
  lesson_type_unmapped: 'problemLessonTypeUnmapped',
  invalid_row: 'problemInvalidRow',
  duplicate_row: 'problemDuplicateRow',
  customer_not_found: 'problemCustomerNotFound',
  already_imported: 'problemAlreadyImported',
};

const BLOCKING = new Set<ImportProblem>([
  'instructor_not_found',
  'instructor_ambiguous',
  'lesson_type_unmapped',
  'invalid_row',
  'duplicate_row',
]);

const STATUS_KEYS: Record<ImportStatus, CopyKey> = {
  draft: 'statusDraft',
  committed: 'statusCommitted',
  discarded: 'statusDiscarded',
};

const ROW_STATUS_KEYS: Record<ImportRowStatus, CopyKey> = {
  scheduled: 'rowStatusScheduled',
  completed: 'rowStatusCompleted',
  cancelled: 'rowStatusCancelled',
};

const SUMMARY_TILES: [keyof ImportSummary, CopyKey, boolean][] = [
  ['matched', 'countMatched', true],
  ['needsInstructor', 'countNeedsInstructor', true],
  ['needsLessonType', 'countNeedsLessonType', true],
  ['customerNotFound', 'countCustomerNotFound', true],
  ['cancelled', 'countCancelled', true],
  ['invalid', 'countInvalid', false],
  ['duplicate', 'countDuplicate', false],
  ['alreadyImported', 'countAlreadyImported', false],
];

const FILTERS: [RowFilter | '', CopyKey][] = [
  ['any', 'filterAny'],
  ['blocking', 'filterBlocking'],
  ['instructor_not_found', 'problemInstructorNotFound'],
  ['instructor_ambiguous', 'problemInstructorAmbiguous'],
  ['lesson_type_unmapped', 'problemLessonTypeUnmapped'],
  ['customer_not_found', 'problemCustomerNotFound'],
  ['invalid_row', 'problemInvalidRow'],
  ['duplicate_row', 'problemDuplicateRow'],
  ['already_imported', 'problemAlreadyImported'],
  ['', 'filterAll'],
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function localeTag(locale: Locale) {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-CA';
}

export function formatSchoolDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: SCHOOL_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatSchoolDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: SCHOOL_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export function formatSchoolTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: SCHOOL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function lessonTypeLabel(lt: LessonType, locale: Locale) {
  return localizeField(lt.nameEn, lt.nameZh, locale) || lt.nameEn;
}

function instructorLabel(i: AdminInstructorRecord, locale: Locale) {
  return localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email;
}

export function ImportHistoryPage() {
  const t = useT();
  const imports = useClassImports();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const latestDraft = (imports.data ?? []).find((i) => i.status === 'draft');

  useEffect(() => {
    if (!selectedId && latestDraft) setSelectedId(latestDraft.id);
  }, [selectedId, latestDraft]);

  const side = (
    <>
      <UploadCard onUploaded={setSelectedId} />
      <RecentImports
        imports={imports.data ?? []}
        selectedId={selectedId}
        onOpen={setSelectedId}
      />
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">{t.classImport.title}</h1>
        <p className="max-w-3xl text-slate">{t.classImport.intro}</p>
      </div>

      {selectedId ? (
        <ImportWorkspace id={selectedId} side={side} />
      ) : (
        <TwoColumns side={side}>
          {imports.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <EmptyState title={t.classImport.emptyTitle}>
              {t.classImport.emptyBody}
            </EmptyState>
          )}
        </TwoColumns>
      )}
    </div>
  );
}

function TwoColumns({
  children,
  side,
}: {
  children: ReactNode;
  side: ReactNode;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      <div className="flex flex-col gap-6">{side}</div>
    </div>
  );
}

function UploadCard({ onUploaded }: { onUploaded: (id: string) => void }) {
  const t = useT();
  const upload = useUploadClassImport();
  const [file, setFile] = useState<File | null>(null);
  const tooLarge = Boolean(file && file.size > MAX_FILE_BYTES);
  const serverTooLarge =
    upload.error instanceof ApiError && upload.error.status === 413;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || tooLarge) return;
    upload.mutate(file, {
      onSuccess: (detail) => {
        setFile(null);
        onUploaded(detail.import.id);
      },
    });
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <h2 className="text-lg">{t.classImport.uploadTitle}</h2>
        <p className="text-sm text-slate">{t.classImport.uploadBody}</p>
        <Field
          label={t.classImport.fileLabel}
          error={tooLarge ? t.classImport.fileTooLarge : undefined}
        >
          {(p) => (
            <input
              {...p}
              key={file ? 'chosen' : 'empty'}
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-navy-tint file:px-3 file:py-2 file:text-navy"
              onChange={(e) => {
                upload.reset();
                setFile(e.target.files?.[0] ?? null);
              }}
            />
          )}
        </Field>
        {upload.isError && (
          <Banner tone="error" title={t.classImport.uploadFailed}>
            {serverTooLarge
              ? t.classImport.fileTooLarge
              : errorText(upload.error, t.errors.generic)}
          </Banner>
        )}
        <Button
          type="submit"
          loading={upload.isPending}
          disabled={!file || tooLarge}
        >
          {t.classImport.upload}
        </Button>
      </form>
    </Card>
  );
}

function StatusChip({ status }: { status: ImportStatus }) {
  const t = useT();
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium',
        status === 'draft' && 'bg-status-pending/10 text-ink',
        status === 'committed' && 'bg-status-approved/10 text-ink',
        status === 'discarded' && 'bg-sunken text-slate',
      )}
    >
      {t.classImport[STATUS_KEYS[status]]}
    </span>
  );
}

function RecentImports({
  imports,
  selectedId,
  onOpen,
}: {
  imports: ClassImport[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg">{t.classImport.recentTitle}</h2>
      {imports.length === 0 ? (
        <p className="text-sm text-slate">{t.classImport.recentEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-grey/60">
          {imports.map((i) => (
            <li
              key={i.id}
              className={cn(
                'flex items-center gap-3 py-2',
                i.id === selectedId && 'font-medium',
              )}
            >
              <div className="min-w-0 flex-1">
                <p data-private className="truncate text-sm text-ink">
                  {i.filename}
                </p>
                <p className="text-xs text-slate">
                  {formatSchoolDateTime(i.createdAt, locale)}
                  {i.counts.total !== undefined &&
                    ` · ${fill(t.classImport.rowsCount, { count: i.counts.total })}`}
                </p>
              </div>
              <StatusChip status={i.status} />
              <Button
                size="sm"
                variant="secondary"
                aria-label={fill(t.classImport.openFor, { name: i.filename })}
                disabled={i.id === selectedId}
                onClick={() => onOpen(i.id)}
              >
                {t.classImport.open}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ImportWorkspace({ id, side }: { id: string; side: ReactNode }) {
  const t = useT();
  const [filter, setFilter] = useState<RowFilter | ''>('any');
  const [paging, setPaging] = useState({ id, page: 1 });
  if (paging.id !== id) setPaging({ id, page: 1 });
  const page = paging.id === id ? paging.page : 1;
  const detail = useClassImport(id, filter, page);
  const lessonTypes = useLessonTypes();
  const instructors = useAdminInstructors({});
  const result = detail.data;
  const fresh = result && !detail.isPlaceholderData ? result : undefined;
  const lastPage = fresh
    ? Math.max(1, Math.ceil(fresh.total / IMPORT_ROWS_PAGE_SIZE))
    : page;

  useEffect(() => {
    if (fresh && fresh.detail.rows.length === 0 && lastPage < page) {
      setPaging({ id, page: lastPage });
    }
  }, [fresh, lastPage, page, id]);

  if (detail.isLoading) {
    return (
      <TwoColumns side={side}>
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </TwoColumns>
    );
  }
  if (detail.isError || !result) {
    return (
      <TwoColumns side={side}>
        <Banner tone="error">
          {errorText(detail.error, t.errors.generic)}
        </Banner>
      </TwoColumns>
    );
  }
  const data = result.detail;
  const editable = data.import.status === 'draft';
  return (
    <>
      <TwoColumns side={side}>
        <SummaryCard detail={data} />
        {editable && <CommitCard detail={data} />}
        <EventMapCard
          detail={data}
          lessonTypes={lessonTypes.data ?? []}
          editable={editable}
        />
      </TwoColumns>
      <RowsCard
        id={id}
        detail={data}
        filter={filter}
        onFilter={(next) => {
          setFilter(next);
          setPaging({ id, page: 1 });
        }}
        page={page}
        shownPage={result.page}
        total={result.total}
        busy={detail.isPlaceholderData}
        onPage={(next) => setPaging({ id, page: next })}
        lessonTypes={lessonTypes.data ?? []}
        instructors={instructors.data ?? []}
        editable={editable}
      />
    </>
  );
}

function SummaryCard({ detail }: { detail: ClassImportDetail }) {
  const t = useT();
  const { locale } = useLocale();
  const { import: record, summary } = detail;
  const commit = record.counts.commit;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg">{t.classImport.summaryTitle}</h2>
        <StatusChip status={record.status} />
        <span className="min-w-0 truncate text-sm text-slate">
          <span data-private>{record.filename}</span> ·{' '}
          {fill(t.classImport.rowsCount, { count: summary.total })}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SUMMARY_TILES.filter(
          ([key, , always]) => always || summary[key] > 0,
        ).map(([key, label]) => (
          <div key={key} className="rounded-md bg-sunken px-3 py-2">
            <dt className="text-xs text-slate">{t.classImport[label]}</dt>
            <dd className="text-2xl text-ink">{summary[key]}</dd>
          </div>
        ))}
      </dl>
      {record.status === 'committed' && (
        <Banner tone="approved">
          <p>
            {fill(t.classImport.committedNotice, {
              date: record.committedAt
                ? formatSchoolDateTime(record.committedAt, locale)
                : '',
            })}
          </p>
          {commit && <p>{commitText(t.classImport, commit)}</p>}
        </Banner>
      )}
      {record.status === 'discarded' && (
        <Banner tone="info">{t.classImport.discardedNotice}</Banner>
      )}
    </Card>
  );
}

function commitText(
  copy: Copy,
  counts: NonNullable<ClassImport['counts']['commit']>,
) {
  return fill(copy.commitDone, {
    created: counts.created,
    participants: counts.participants,
    already: counts.alreadyImported,
    skipped: counts.skipped,
  });
}

function CommitCard({ detail }: { detail: ClassImportDetail }) {
  const t = useT();
  const id = detail.import.id;
  const commit = useCommitClassImport(id);
  const discard = useDiscardClassImport(id);
  const [confirming, setConfirming] = useState<'commit' | 'discard' | null>(
    null,
  );
  const count = detail.summary.willImport;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg">{t.classImport.commitTitle}</h2>
      <p className="text-sm text-slate">{t.classImport.commitBody}</p>
      {commit.isError && (
        <Banner tone="error" title={t.classImport.commitFailed}>
          {errorText(commit.error, t.errors.generic)}
        </Banner>
      )}
      {discard.isError && (
        <Banner tone="error" title={t.classImport.discardFailed}>
          {errorText(discard.error, t.errors.generic)}
        </Banner>
      )}
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-md bg-sunken p-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-ink">
            {confirming === 'commit'
              ? fill(t.classImport.commitConfirm, { count })
              : t.classImport.discardConfirm}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirming(null)}
              disabled={commit.isPending || discard.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button
              loading={commit.isPending || discard.isPending}
              onClick={() =>
                (confirming === 'commit' ? commit : discard).mutate(undefined, {
                  onSettled: () => setConfirming(null),
                })
              }
            >
              {t.classImport.confirm}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={count === 0}
            onClick={() => setConfirming('commit')}
          >
            {fill(t.classImport.commit, { count })}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming('discard')}>
            {t.classImport.discard}
          </Button>
        </div>
      )}
    </Card>
  );
}

function EventMapCard({
  detail,
  lessonTypes,
  editable,
}: {
  detail: ClassImportDetail;
  lessonTypes: LessonType[];
  editable: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const save = useSaveEventMap();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const changed = Object.entries(edits).filter(
    ([name, value]) =>
      value !==
      (detail.eventNames.find((e) => e.eventName === name)?.lessonTypeId ?? ''),
  );

  function submit() {
    save.mutate(
      changed.map(([eventName, value]) => ({
        eventName,
        lessonTypeId: value || null,
      })),
      { onSuccess: () => setEdits({}) },
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">{t.classImport.mappingTitle}</h2>
        <p className="text-sm text-slate">{t.classImport.mappingBody}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
              <th className="px-4 py-2 font-medium">
                {t.classImport.colEventName}
              </th>
              <th className="px-4 py-2 text-right font-medium">
                {t.classImport.colRows}
              </th>
              <th className="px-4 py-2 font-medium">
                {t.classImport.colLessonType}
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.eventNames.map((e, i) => (
              <tr key={e.eventName} className={cn(i % 2 === 1 && 'bg-sunken')}>
                <td className="px-4 py-2 text-ink">{e.eventName}</td>
                <td className="px-4 py-2 text-right tabular-nums">{e.rows}</td>
                <td className="px-4 py-2">
                  <Select
                    aria-label={fill(t.classImport.lessonTypeForEvent, {
                      name: e.eventName,
                    })}
                    disabled={!editable}
                    value={edits[e.eventName] ?? e.lessonTypeId ?? ''}
                    onChange={(ev) => {
                      save.reset();
                      setEdits((v) => ({
                        ...v,
                        [e.eventName]: ev.target.value,
                      }));
                    }}
                  >
                    <option value="">{t.classImport.notMapped}</option>
                    {lessonTypes.map((lt) => (
                      <option key={lt.id} value={lt.id}>
                        {lessonTypeLabel(lt, locale)}
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex flex-col gap-3">
          {save.isError && (
            <Banner tone="error" title={t.classImport.mappingFailed}>
              {errorText(save.error, t.errors.generic)}
            </Banner>
          )}
          {save.isSuccess && (
            <Banner tone="approved">{t.classImport.mappingsSaved}</Banner>
          )}
          <div>
            <Button
              loading={save.isPending}
              disabled={changed.length === 0}
              onClick={submit}
            >
              {t.classImport.saveMappings}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RowsCard({
  id,
  detail,
  filter,
  onFilter,
  page,
  shownPage,
  total,
  busy,
  onPage,
  lessonTypes,
  instructors,
  editable,
}: {
  id: string;
  detail: ClassImportDetail;
  filter: RowFilter | '';
  onFilter: (f: RowFilter | '') => void;
  page: number;
  shownPage: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
  lessonTypes: LessonType[];
  instructors: AdminInstructorRecord[];
  editable: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const update = useUpdateImportRow(id);
  const [failedRow, setFailedRow] = useState<number | null>(null);
  const instructorOptions = instructors
    .map((i) => [i.id, instructorLabel(i, locale)] as const)
    .sort((a, b) => a[1].localeCompare(b[1]));

  function patch(rowNo: number, body: ImportRowPatch) {
    setFailedRow(null);
    update.mutate({ rowNo, ...body }, { onError: () => setFailedRow(rowNo) });
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <h2 className="flex-1 text-lg">{t.classImport.rowsTitle}</h2>
        <div className="sm:w-64">
          <Field label={t.classImport.filterLabel}>
            {(p) => (
              <Select
                {...p}
                value={filter}
                onChange={(e) => onFilter(e.target.value as RowFilter | '')}
              >
                {FILTERS.map(([value, label]) => (
                  <option key={value || 'all'} value={value}>
                    {t.classImport[label]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
      {failedRow !== null && update.isError && (
        <div>
          <Banner
            tone="error"
            title={fill(t.classImport.rowFailed, { row: failedRow })}
          >
            {errorText(update.error, t.errors.generic)}
          </Banner>
        </div>
      )}
      {detail.rows.length === 0 ? (
        <p className="text-sm text-slate">{t.classImport.rowsEmpty}</p>
      ) : (
        <div
          className={cn(
            'overflow-x-auto transition-opacity',
            busy && 'opacity-60',
          )}
          aria-busy={busy}
        >
          <table className="w-full min-w-[50rem] text-sm">
            <thead>
              <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                <th className="px-3 py-2 font-medium">
                  {t.classImport.colRow}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t.classImport.colWhen}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t.classImport.colInstructor}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t.classImport.colLessonType}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t.classImport.colCustomer}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t.classImport.colStatus}
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.rows.map((row, i) => (
                <RowItem
                  key={row.rowNo}
                  row={row}
                  striped={i % 2 === 1}
                  editable={editable && row.classId === null}
                  lessonTypes={lessonTypes}
                  instructorOptions={instructorOptions}
                  busy={update.isPending}
                  onPatch={(body) => patch(row.rowNo, body)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detail.rows.length > 0 && (
        <Pager
          page={page}
          shownPage={shownPage}
          pageSize={IMPORT_ROWS_PAGE_SIZE}
          count={detail.rows.length}
          total={total}
          busy={busy}
          onPage={onPage}
          className="border-t border-grey/60 px-0 pb-0"
          text={{
            label: t.classImport.rowsPagination,
            showing: t.classImport.rowsShowing,
            previous: t.classImport.prevPage,
            next: t.classImport.nextPage,
          }}
        />
      )}
    </Card>
  );
}

function ProblemChips({ problems }: { problems: ImportProblem[] }) {
  const t = useT();
  if (problems.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {problems.map((p) => (
        <li
          key={p}
          className={cn(
            'whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs',
            BLOCKING.has(p)
              ? 'bg-red-tint text-red'
              : 'bg-status-pending/10 text-ink',
          )}
        >
          {t.classImport[PROBLEM_KEYS[p]]}
        </li>
      ))}
    </ul>
  );
}

function RowItem({
  row,
  striped,
  editable,
  lessonTypes,
  instructorOptions,
  busy,
  onPatch,
}: {
  row: ClassImportRow;
  striped: boolean;
  editable: boolean;
  lessonTypes: LessonType[];
  instructorOptions: (readonly [string, string])[];
  busy: boolean;
  onPatch: (body: ImportRowPatch) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [finding, setFinding] = useState(false);
  const instructorProblem = row.problems.find((p) =>
    p.startsWith('instructor_'),
  );
  const csvCustomer = [row.customerName, row.customerEmail ?? row.customerPhone]
    .filter(Boolean)
    .join(' · ');

  return (
    <tr className={cn('align-top', striped && 'bg-sunken')}>
      <td className="px-3 py-2 font-mono text-xs text-slate">{row.rowNo}</td>
      <td className="whitespace-nowrap px-3 py-2">
        {row.startsAt ? (
          <>
            <p className="text-ink">{formatSchoolDate(row.startsAt, locale)}</p>
            <p className="text-slate">
              {formatSchoolTime(row.startsAt, locale)}
              {row.endsAt && ` – ${formatSchoolTime(row.endsAt, locale)}`}
            </p>
          </>
        ) : (
          '—'
        )}
        <ProblemChips
          problems={row.problems.filter(
            (p) => p === 'invalid_row' || p === 'duplicate_row',
          )}
        />
      </td>
      <td className="px-3 py-2">
        <Select
          aria-label={fill(t.classImport.instructorFor, { row: row.rowNo })}
          disabled={!editable || busy}
          value={row.instructorId ?? ''}
          onChange={(e) =>
            e.target.value && onPatch({ instructorId: e.target.value })
          }
          className="h-9 min-w-[10rem] text-sm"
        >
          <option value="" disabled>
            {t.classImport.chooseInstructor}
          </option>
          {instructorOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-slate">
          {fill(t.classImport.csvValue, { value: row.instructorName ?? '—' })}
          {row.manualFields.includes('instructor') &&
            ` · ${t.classImport.manual}`}
        </p>
        {instructorProblem && <ProblemChips problems={[instructorProblem]} />}
      </td>
      <td className="px-3 py-2">
        <Select
          aria-label={fill(t.classImport.lessonTypeFor, { row: row.rowNo })}
          disabled={!editable || busy}
          value={row.lessonTypeId ?? ''}
          onChange={(e) =>
            e.target.value && onPatch({ lessonTypeId: e.target.value })
          }
          className="h-9 min-w-[10rem] text-sm"
        >
          <option value="" disabled>
            {t.classImport.chooseLessonType}
          </option>
          {lessonTypes.map((lt) => (
            <option key={lt.id} value={lt.id}>
              {lessonTypeLabel(lt, locale)}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-slate">
          {fill(t.classImport.csvValue, { value: row.eventName ?? '—' })}
          {row.manualFields.includes('lesson_type') &&
            ` · ${t.classImport.manual}`}
        </p>
        <ProblemChips
          problems={row.problems.filter((p) => p === 'lesson_type_unmapped')}
        />
      </td>
      <td className="min-w-[12rem] px-3 py-2">
        <p className="text-ink">
          {row.customerId
            ? (row.matchedCustomerName ?? row.customerId)
            : t.classImport.noCustomer}
          {row.manualFields.includes('customer') &&
            ` · ${t.classImport.manual}`}
        </p>
        {csvCustomer && (
          <p className="break-words text-xs text-slate">
            {fill(t.classImport.csvValue, { value: csvCustomer })}
          </p>
        )}
        <ProblemChips
          problems={row.problems.filter((p) => p === 'customer_not_found')}
        />
        {editable &&
          (finding ? (
            <CustomerFinder
              row={row}
              busy={busy}
              onPick={(customerId) => {
                setFinding(false);
                onPatch({ customerId });
              }}
              onCancel={() => setFinding(false)}
            />
          ) : (
            <button
              type="button"
              className="mt-1 text-xs text-navy underline"
              aria-label={fill(t.classImport.findCustomerFor, {
                row: row.rowNo,
              })}
              onClick={() => setFinding(true)}
            >
              {t.classImport.findCustomer}
            </button>
          ))}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        {row.statusToSet
          ? t.classImport[ROW_STATUS_KEYS[row.statusToSet]]
          : '—'}
        <ProblemChips
          problems={row.problems.filter((p) => p === 'already_imported')}
        />
      </td>
    </tr>
  );
}

function CustomerFinder({
  row,
  busy,
  onPick,
  onCancel,
}: {
  row: ClassImportRow;
  busy: boolean;
  onPick: (customerId: string | null) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(
    row.customerEmail ?? row.customerName ?? '',
  );
  const [q, setQ] = useState(draft);
  const results = useCustomerSearch(q);

  return (
    <div className="mt-2 flex min-w-[14rem] flex-col gap-2 rounded-md bg-surface p-2 shadow-sm">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft.trim());
        }}
      >
        <Input
          aria-label={t.classImport.customerSearchLabel}
          className="h-9 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" size="sm" variant="secondary">
          {t.classImport.customerSearch}
        </Button>
      </form>
      {results.isLoading ? (
        <Spinner />
      ) : (
        <Select
          aria-label={fill(t.classImport.customerFor, { row: row.rowNo })}
          className="h-9 text-sm"
          disabled={busy}
          value=""
          onChange={(e) =>
            onPick(e.target.value === 'none' ? null : e.target.value)
          }
        >
          <option value="" disabled>
            {t.classImport.chooseCustomer}
          </option>
          <option value="none">{t.classImport.noCustomer}</option>
          {(results.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {[customerName(c), c.email].filter(Boolean).join(' · ')}
            </option>
          ))}
        </Select>
      )}
      <button
        type="button"
        className="self-start text-xs text-slate underline"
        onClick={onCancel}
      >
        {t.common.cancel}
      </button>
    </div>
  );
}
