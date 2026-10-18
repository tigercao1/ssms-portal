import { Fragment, useState, type FormEvent } from 'react';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Pager,
  RowActions,
  Select,
  Spinner,
  Textarea,
} from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import type { Locale } from '@/i18n/core/types';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime } from '@/lib/date';
import { todayIso } from '@/features/documents/api/validity';
import { StatePill } from '@/features/documents/onboarding/StatePill';
import { currentSeasonKey, useSeasons } from '@/features/reference/api';
import { SeasonSelect } from '@/features/reference/SeasonSelect';
import {
  durationText,
  RecordStatusCell,
  RequestStatusPill,
  studentNames,
} from '@/features/insurance/RecordStatus';
import {
  LessonTree,
  treeLessonOf,
  useInsuranceText,
} from '@/features/insurance/LessonTree';
import { CAP_CENTS, dollars } from '@/features/insurance/money';
import { useToast } from '@/features/insurance/Toast';
import type {
  AdminInsuranceRecord,
  AdminInsuranceRequest,
  AdminInsuranceSummary,
  InsurancePaymentStatus,
  SeasonCoverage,
} from '@/features/insurance/types';
import { errorCodeOf } from '@/features/insurance/api';
import { errorText, formatDay } from '../payroll/payrollFormat';
import {
  useGrantSeasonPass,
  useInsuranceRecords,
  useInsuranceRequests,
  useInsuranceSummary,
  useMarkPaid,
  useMarkRequestPaid,
  useMarkRequestUnpaid,
  useMarkUnpaid,
  useRequestLessonCount,
  useVoidRecord,
  useVoidRequest,
} from './insuranceApi';

export const INSURANCE_PAGE_SIZE = 25;

const STATUSES: InsurancePaymentStatus[] = [
  'unpaid',
  'paid',
  'not_required',
  'voided',
];

interface ActionTarget {
  kind: 'record' | 'request';
  id: string;
  no: string;
  summary: string;
  request?: {
    id: string;
    no: string;
    season: string;
    instructorId: string;
    lessons: number | null;
  };
}

type Dialog =
  | { kind: 'paid' | 'unpaid' | 'void'; target: ActionTarget }
  | { kind: 'grant' | 'removePass'; row: AdminInsuranceSummary }
  | null;

export function AdminInsurancePage() {
  const t = useT();
  const s = t.adminInsurance;
  const { locale } = useLocale();
  const seasons = useSeasons();
  const [pickedSeason, setPickedSeason] = useState<string | null>(null);
  const season = pickedSeason ?? currentSeasonKey(seasons.data);
  const [instructorId, setInstructorId] = useState('');
  const [status, setStatus] = useState<InsurancePaymentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [requestPage, setRequestPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const { toast, showToast } = useToast();
  const summary = useInsuranceSummary(season);
  const filter = {
    season,
    instructorId: instructorId || undefined,
    paymentStatus: status || undefined,
    limit: INSURANCE_PAGE_SIZE,
  };
  const records = useInsuranceRecords({ ...filter, page });
  const requests = useInsuranceRequests({ ...filter, page: requestPage });

  function resetPages() {
    setPage(1);
    setRequestPage(1);
  }

  function changeSeason(key: string) {
    setPickedSeason(key);
    setInstructorId('');
    resetPages();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h1 className="text-3xl">{s.title}</h1>
          <p className="text-sm text-slate">{s.intro}</p>
        </div>
        <Field label={s.season}>
          {(p) => (
            <SeasonSelect
              {...p}
              className="w-48"
              value={season}
              onChange={changeSeason}
            />
          )}
        </Field>
      </div>

      <SummaryTable
        query={summary}
        waiting={seasons.isLoading}
        onPick={(id) => {
          setInstructorId(id);
          resetPages();
        }}
        onAction={setDialog}
      />

      <section
        aria-labelledby="insurance-requests"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex max-w-xl flex-col gap-1">
            <h2 id="insurance-requests" className="text-xl">
              {s.requestsTitle}
            </h2>
            <p className="text-sm text-slate">{s.requestsIntro}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Field label={s.filterInstructor}>
              {(p) => (
                <Select
                  {...p}
                  className="sm:w-56"
                  value={instructorId}
                  onChange={(e) => {
                    setInstructorId(e.target.value);
                    resetPages();
                  }}
                >
                  <option value="">{s.filterInstructorAll}</option>
                  {(summary.data ?? []).map((row) => (
                    <option key={row.instructorId} value={row.instructorId}>
                      {instructorLabel(row.name, row.nameZh, row.email, locale)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={s.filterStatus}>
              {(p) => (
                <Select
                  {...p}
                  className="sm:w-44"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as InsurancePaymentStatus | '');
                    resetPages();
                  }}
                >
                  <option value="">{s.filterStatusAll}</option>
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {paymentLabel(value, s)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>
        <RequestsTable
          query={requests}
          waiting={seasons.isLoading}
          page={requestPage}
          onPage={setRequestPage}
          onAction={setDialog}
        />
      </section>

      <section
        aria-labelledby="insurance-records"
        className="flex flex-col gap-3"
      >
        <h2 id="insurance-records" className="text-xl">
          {s.recordsTitle}
        </h2>
        <RecordsTable
          query={records}
          requests={requests.data?.requests ?? []}
          waiting={seasons.isLoading}
          page={page}
          onPage={setPage}
          onAction={setDialog}
        />
      </section>

      {dialog?.kind === 'paid' && (
        <MarkPaidDialog
          target={dialog.target}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            showToast(s.markPaidToast.replace('{recordNo}', dialog.target.no));
          }}
        />
      )}
      {dialog?.kind === 'unpaid' && (
        <MarkUnpaidDialog
          target={dialog.target}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            showToast(
              s.markUnpaidToast.replace('{recordNo}', dialog.target.no),
            );
          }}
        />
      )}
      {dialog?.kind === 'void' && (
        <VoidDialog
          target={dialog.target}
          title={s.voidTitle.replace('{recordNo}', dialog.target.no)}
          summary={dialog.target.summary}
          body={wholeRequest(dialog.target) ? s.requestVoidBody : s.voidBody}
          confirm={
            wholeRequest(dialog.target) ? s.requestVoidConfirm : s.voidConfirm
          }
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            showToast(s.voidToast.replace('{recordNo}', dialog.target.no));
          }}
        />
      )}
      {dialog?.kind === 'grant' && (
        <GrantSeasonPassDialog
          row={dialog.row}
          season={season}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            showToast(
              s.grantToast
                .replace('{recordNo}', r.recordNo)
                .replace('{name}', rowLabel(dialog.row, locale)),
            );
          }}
        />
      )}
      {dialog?.kind === 'removePass' && dialog.row.seasonPassRecordId && (
        <VoidDialog
          target={{ kind: 'record', id: dialog.row.seasonPassRecordId }}
          title={s.removePassTitle.replace(
            '{name}',
            rowLabel(dialog.row, locale),
          )}
          summary={`${rowLabel(dialog.row, locale)} · ${season}`}
          body={s.removePassBody}
          confirm={s.removePassConfirm}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            showToast(
              s.removePassToast.replace('{name}', rowLabel(dialog.row, locale)),
            );
          }}
        />
      )}
      {toast}
    </div>
  );
}

type Strings = ReturnType<typeof useT>['adminInsurance'];

function paymentLabel(status: InsurancePaymentStatus, s: Strings) {
  return {
    unpaid: s.paymentUnpaid,
    paid: s.paymentPaid,
    not_required: s.paymentNotRequired,
    voided: s.paymentVoided,
  }[status];
}

function coverageLabel(coverage: SeasonCoverage, s: Strings) {
  return {
    none: s.coverageNone,
    capped: s.coverageCapped,
    season_pass: s.coverageSeasonPass,
  }[coverage];
}

function instructorLabel(
  name: string | null,
  nameZh: string | null,
  email: string | null,
  locale: Locale,
) {
  return localizeField(name, nameZh, locale) || email || '—';
}

function rowLabel(row: AdminInsuranceSummary, locale: Locale) {
  return instructorLabel(row.name, row.nameZh, row.email, locale);
}

function InstructorName({
  row,
}: {
  row: { name: string | null; nameZh: string | null; email: string | null };
}) {
  const { locale } = useLocale();
  return <>{instructorLabel(row.name, row.nameZh, row.email, locale)}</>;
}

function SummaryTable({
  query,
  waiting,
  onPick,
  onAction,
}: {
  query: ReturnType<typeof useInsuranceSummary>;
  waiting: boolean;
  onPick: (instructorId: string) => void;
  onAction: (dialog: Dialog) => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const th = 'whitespace-nowrap px-4 py-2 font-medium';
  return (
    <section
      aria-labelledby="insurance-summary"
      className="flex flex-col gap-3"
    >
      <h2 id="insurance-summary" className="text-xl">
        {s.summaryTitle}
      </h2>
      <Card className="p-0">
        {query.isLoading || waiting ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <Banner tone="error">{errorText(query.error, s.loadFailed)}</Banner>
          </div>
        ) : (query.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate">{s.summaryEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              aria-label={s.summaryTitle}
              className="w-full min-w-[46rem] text-sm"
            >
              <thead>
                <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                  <th className={th}>{s.colInstructor}</th>
                  <th className={cn(th, 'text-right')}>{s.colOwed}</th>
                  <th className={cn(th, 'text-right')}>{s.colPaid}</th>
                  <th className={cn(th, 'text-right')}>{s.colUnpaid}</th>
                  <th className={th}>{s.colProgress}</th>
                  <th className={th}>{s.colCoverage}</th>
                  <th className={cn(th, 'text-right')}>{s.colRecords}</th>
                </tr>
              </thead>
              <tbody>
                {(query.data ?? []).map((row, i) => (
                  <SummaryRow
                    key={row.instructorId}
                    row={row}
                    striped={i % 2 === 1}
                    onPick={onPick}
                    onAction={onAction}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

function SummaryRow({
  row,
  striped,
  onPick,
  onAction,
}: {
  row: AdminInsuranceSummary;
  striped: boolean;
  onPick: (instructorId: string) => void;
  onAction: (dialog: Dialog) => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const pct = Math.min(100, (row.owedCents / CAP_CENTS) * 100);
  const td = 'whitespace-nowrap px-4 py-2.5';
  return (
    <tr className={cn(striped && 'bg-sunken')}>
      <td className="px-4 py-2.5">
        <button
          type="button"
          className="text-left font-medium text-navy hover:underline"
          onClick={() => onPick(row.instructorId)}
        >
          <InstructorName row={row} />
        </button>
        <span className="block font-mono text-xs text-slate">{row.email}</span>
      </td>
      <td className={cn(td, 'text-right tabular-nums')}>
        {dollars(row.owedCents)}
      </td>
      <td className={cn(td, 'text-right tabular-nums')}>
        {dollars(row.paidCents)}
      </td>
      <td
        className={cn(
          td,
          'text-right tabular-nums',
          row.unpaidCents > 0 && 'font-semibold text-status-pending',
        )}
      >
        {dollars(row.unpaidCents)}
      </td>
      <td className={td}>
        <div className="flex items-center gap-2">
          <div
            role="progressbar"
            aria-label={s.colProgress}
            aria-valuemin={0}
            aria-valuemax={CAP_CENTS / 100}
            aria-valuenow={Math.min(row.owedCents, CAP_CENTS) / 100}
            className="h-2 w-24 overflow-hidden rounded-full bg-grey/40"
          >
            <div
              className="h-full rounded-full bg-red"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-slate">
            {dollars(row.owedCents)} / {dollars(CAP_CENTS)}
          </span>
        </div>
      </td>
      <td className={td}>
        <div className="flex flex-col items-start gap-1.5">
          <StatePill
            tone={row.coverage === 'none' ? 'muted' : 'done'}
            label={
              row.seasonPassRecordId
                ? s.coverageSeasonPass
                : coverageLabel(row.coverage, s)
            }
          />
          {row.seasonPassPaymentStatus && (
            <span
              className={cn(
                'text-xs',
                row.seasonPassPaymentStatus === 'unpaid'
                  ? 'font-medium text-status-pending'
                  : 'text-slate',
              )}
            >
              {paymentLabel(row.seasonPassPaymentStatus, s)}
            </span>
          )}
          {row.seasonPassRecordId ? (
            <Button
              size="sm"
              variant="ghost"
              className="-ml-3"
              onClick={() => onAction({ kind: 'removePass', row })}
            >
              {s.removePass}
            </Button>
          ) : row.coverage === 'none' && row.owedCents < CAP_CENTS ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onAction({ kind: 'grant', row })}
            >
              {s.grantPass}
            </Button>
          ) : null}
        </div>
      </td>
      <td className={cn(td, 'text-right tabular-nums')}>{row.records}</td>
    </tr>
  );
}

function wholeRequest(target: Pick<ActionTarget, 'kind' | 'request'>) {
  return target.kind === 'request' || Boolean(target.request);
}

function useWholeRequest(target: Pick<ActionTarget, 'request'>) {
  const request = target.request;
  const lookup = useRequestLessonCount(
    request && request.lessons === null
      ? {
          id: request.id,
          season: request.season,
          instructorId: request.instructorId,
        }
      : null,
  );
  if (!request) return null;
  if (request.lessons !== null)
    return { no: request.no, lessons: request.lessons, loading: false };
  return {
    no: request.no,
    lessons: lookup.data ?? null,
    loading: lookup.isPending,
  };
}

type WholeRequest = ReturnType<typeof useWholeRequest>;

function WholeRequestNote({ whole }: { whole: WholeRequest }) {
  const f = useInsuranceText();
  const s = useT().adminInsurance;
  if (!whole) return null;
  return (
    <p data-testid="whole-request" className="text-sm font-semibold text-navy">
      {whole.loading ? (
        <span data-testid="whole-request-loading">
          <Spinner />
        </span>
      ) : whole.lessons === null ? (
        s.wholeRequestNoteNoCount.replace('{requestNo}', whole.no)
      ) : (
        s.wholeRequestNote
          .replace('{requestNo}', whole.no)
          .replace('{lessons}', f.lessons(whole.lessons))
      )}
    </p>
  );
}

function RecordsTable({
  query,
  requests,
  waiting,
  page,
  onPage,
  onAction,
}: {
  query: ReturnType<typeof useInsuranceRecords>;
  requests: AdminInsuranceRequest[];
  waiting: boolean;
  page: number;
  onPage: (page: number) => void;
  onAction: (dialog: Dialog) => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const { locale } = useLocale();
  const th = 'whitespace-nowrap px-2.5 py-2 font-medium';
  const td = 'whitespace-nowrap px-2.5 py-2.5';
  const rows = query.data?.records ?? [];
  const separator = locale === 'zh-CN' ? '、' : ', ';

  if (query.isLoading || waiting)
    return (
      <Card className="flex justify-center py-10">
        <Spinner />
      </Card>
    );
  if (query.isError)
    return <Banner tone="error">{errorText(query.error, s.loadFailed)}</Banner>;

  return (
    <Card className="p-0">
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate">{s.recordsEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table
            aria-label={s.recordsTitle}
            className="w-full min-w-[52rem] text-sm"
          >
            <thead>
              <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                <th className={th}>{s.colLessonDate}</th>
                <th className={th}>{s.colInstructor}</th>
                <th className={th}>{s.colStudents}</th>
                <th className={th}>{s.colHours}</th>
                <th className={cn(th, 'text-right')}>{s.colAmount}</th>
                <th className={th}>{s.colRecordNo}</th>
                <th className={th}>{s.colStatus}</th>
                <th className={th}>{s.colCreated}</th>
                <th className={cn(th, 'text-right')}>{s.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-grey/40 last:border-0"
                >
                  <td className={td}>
                    {r.kind === 'season_pass'
                      ? t.insurance.seasonPassRow
                      : r.lessonDate
                        ? formatDay(r.lessonDate, locale)
                        : '—'}
                  </td>
                  <td className={td}>
                    <InstructorName
                      row={{
                        name: r.instructorName,
                        nameZh: r.instructorNameZh,
                        email: r.instructorEmail,
                      }}
                    />
                  </td>
                  <td className="min-w-[8rem] px-2.5 py-2.5">
                    {studentNames(r, separator) || '—'}
                  </td>
                  <td className={td}>{durationText(r.durationHours, t)}</td>
                  <td
                    className={cn(
                      td,
                      'text-right tabular-nums',
                      r.paymentStatus === 'voided' && 'text-slate line-through',
                    )}
                  >
                    {dollars(r.amountCents)}
                  </td>
                  <td className={cn(td, 'font-mono text-xs')}>
                    {r.recordNo}
                    {r.requestNo && (
                      <span
                        data-testid="part-of-request"
                        className="block font-body text-xs text-slate"
                      >
                        {s.partOfRequest.replace('{requestNo}', r.requestNo)}
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <RecordStatusCell record={r} />
                    {r.paymentStatus === 'paid' && r.paidOn && (
                      <span className="block text-xs text-slate">
                        {s.paidOnNote.replace(
                          '{date}',
                          formatDay(r.paidOn, locale),
                        )}
                      </span>
                    )}
                    {r.paymentStatus === 'paid' && r.paidNote && (
                      <span className="block max-w-[14rem] truncate text-xs text-slate">
                        {r.paidNote}
                      </span>
                    )}
                    {r.paymentStatus === 'voided' && r.voidedReason && (
                      <span className="block max-w-[14rem] text-xs text-slate">
                        {s.voidedNote.replace('{reason}', r.voidedReason)}
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(td, 'text-slate')}
                    title={formatDateTime(r.createdAt, locale)}
                  >
                    {formatDate(r.createdAt, locale)}
                  </td>
                  <td className={td}>
                    <div className="flex justify-end">
                      <PaymentActions
                        label={s.actionsFor.replace('{recordNo}', r.recordNo)}
                        status={r.paymentStatus}
                        target={{
                          kind: 'record',
                          id: r.id,
                          no: r.recordNo,
                          summary: recordSummary(r, locale),
                          ...(r.requestId &&
                            r.requestNo && {
                              request: {
                                id: r.requestId,
                                no: r.requestNo,
                                season: r.seasonKey,
                                instructorId: r.instructorId,
                                lessons:
                                  requests.find((x) => x.id === r.requestId)
                                    ?.lessonCount ?? null,
                              },
                            }),
                        }}
                        onAction={onAction}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        className="border-t border-grey/60"
        page={page}
        shownPage={page}
        pageSize={INSURANCE_PAGE_SIZE}
        count={rows.length}
        total={query.data?.total ?? 0}
        busy={query.isFetching}
        onPage={onPage}
        text={{
          label: s.pagerLabel,
          showing: s.pagerShowing,
          previous: t.admin.prevPage,
          next: t.admin.nextPage,
        }}
      />
    </Card>
  );
}

function PaymentActions({
  label,
  status,
  target,
  onAction,
}: {
  label: string;
  status: InsurancePaymentStatus;
  target: ActionTarget;
  onAction: (dialog: Dialog) => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  return (
    <RowActions
      label={label}
      items={[
        ...(status === 'unpaid'
          ? [
              {
                key: 'paid',
                label: s.markPaid,
                onSelect: () => onAction({ kind: 'paid', target }),
              },
            ]
          : []),
        ...(status === 'paid'
          ? [
              {
                key: 'unpaid',
                label: s.markUnpaid,
                variant: 'ghost' as const,
                onSelect: () => onAction({ kind: 'unpaid', target }),
              },
            ]
          : []),
        ...(status !== 'voided'
          ? [
              {
                key: 'void',
                label: s.void,
                variant: 'ghost' as const,
                destructive: true,
                onSelect: () => onAction({ kind: 'void', target }),
              },
            ]
          : []),
      ]}
    />
  );
}

function RequestsTable({
  query,
  waiting,
  page,
  onPage,
  onAction,
}: {
  query: ReturnType<typeof useInsuranceRequests>;
  waiting: boolean;
  page: number;
  onPage: (page: number) => void;
  onAction: (dialog: Dialog) => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const { locale } = useLocale();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const th = 'whitespace-nowrap px-2.5 py-2 font-medium';
  const td = 'whitespace-nowrap px-2.5 py-2.5';
  const rows = query.data?.requests ?? [];

  if (query.isLoading || waiting)
    return (
      <Card className="flex justify-center py-10">
        <Spinner />
      </Card>
    );
  if (query.isError)
    return <Banner tone="error">{errorText(query.error, s.loadFailed)}</Banner>;

  return (
    <Card className="p-0">
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate">{s.requestsEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table
            aria-label={s.requestsTitle}
            className="w-full min-w-[52rem] text-sm"
          >
            <thead>
              <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                <th className={th}>{s.colRequestNo}</th>
                <th className={th}>{s.colInstructor}</th>
                <th className={cn(th, 'text-right')}>{s.colLessons}</th>
                <th className={cn(th, 'text-right')}>{s.colStudents}</th>
                <th className={cn(th, 'text-right')}>{s.colAmount}</th>
                <th className={th}>{s.colStatus}</th>
                <th className={th}>{s.colSubmitted}</th>
                <th className={cn(th, 'text-right')}>{s.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const expanded = Boolean(open[r.id]);
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-grey/40 last:border-0">
                      <td className={td}>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={s.showLessons.replace(
                            '{requestNo}',
                            r.requestNo,
                          )}
                          onClick={() =>
                            setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))
                          }
                          className="inline-flex items-center gap-1.5 font-mono text-xs text-navy hover:underline"
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'inline-block text-base text-slate transition-transform',
                              expanded && 'rotate-90',
                            )}
                          >
                            ›
                          </span>
                          {r.requestNo}
                        </button>
                      </td>
                      <td className={td}>
                        <InstructorName
                          row={{
                            name: r.instructorName,
                            nameZh: r.instructorNameZh,
                            email: r.instructorEmail,
                          }}
                        />
                      </td>
                      <td className={cn(td, 'text-right tabular-nums')}>
                        {r.lessonCount}
                      </td>
                      <td className={cn(td, 'text-right tabular-nums')}>
                        {r.studentCount}
                      </td>
                      <td
                        className={cn(
                          td,
                          'text-right tabular-nums',
                          r.paymentStatus === 'voided' &&
                            'text-slate line-through',
                        )}
                      >
                        {dollars(r.totalCents)}
                      </td>
                      <td className="px-2.5 py-2.5">
                        <RequestStatusPill request={r} />
                        {r.paymentStatus === 'paid' && r.paidOn && (
                          <span className="block text-xs text-slate">
                            {s.paidOnNote.replace(
                              '{date}',
                              formatDay(r.paidOn, locale),
                            )}
                          </span>
                        )}
                        {r.paymentStatus === 'paid' && r.paidNote && (
                          <span className="block max-w-[14rem] truncate text-xs text-slate">
                            {r.paidNote}
                          </span>
                        )}
                        {r.paymentStatus === 'voided' && r.voidedReason && (
                          <span className="block max-w-[14rem] text-xs text-slate">
                            {s.voidedNote.replace('{reason}', r.voidedReason)}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(td, 'text-slate')}
                        title={formatDateTime(r.createdAt, locale)}
                      >
                        {formatDate(r.createdAt, locale)}
                      </td>
                      <td className={td}>
                        <div className="flex justify-end">
                          <PaymentActions
                            label={s.actionsFor.replace(
                              '{recordNo}',
                              r.requestNo,
                            )}
                            status={r.paymentStatus}
                            target={{
                              kind: 'request',
                              id: r.id,
                              no: r.requestNo,
                              summary: requestSummary(r, locale),
                            }}
                            onAction={onAction}
                          />
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-grey/40 bg-sunken/50">
                        <td colSpan={8} className="px-4 pb-1 pt-3">
                          <LessonTree lessons={r.lessons.map(treeLessonOf)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        className="border-t border-grey/60"
        page={page}
        shownPage={page}
        pageSize={INSURANCE_PAGE_SIZE}
        count={rows.length}
        total={query.data?.total ?? 0}
        busy={query.isFetching}
        onPage={onPage}
        text={{
          label: s.requestsPagerLabel,
          showing: s.pagerShowing,
          previous: t.admin.prevPage,
          next: t.admin.nextPage,
        }}
      />
    </Card>
  );
}

function requestSummary(request: AdminInsuranceRequest, locale: Locale) {
  const name = instructorLabel(
    request.instructorName,
    request.instructorNameZh,
    request.instructorEmail,
    locale,
  );
  return `${name} · ${dollars(request.totalCents)}`;
}

function actionErrorText(error: unknown, t: ReturnType<typeof useT>) {
  return errorText(error, t.errors.generic);
}

function recordSummary(record: AdminInsuranceRecord, locale: Locale) {
  const name = instructorLabel(
    record.instructorName,
    record.instructorNameZh,
    record.instructorEmail,
    locale,
  );
  return `${name} · ${dollars(record.amountCents)}`;
}

function MarkPaidDialog({
  target,
  onClose,
  onDone,
}: {
  target: ActionTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const recordAction = useMarkPaid();
  const requestAction = useMarkRequestPaid();
  const markPaid = target.kind === 'request' ? requestAction : recordAction;
  const whole = useWholeRequest(target);
  const counting = Boolean(whole?.loading);
  const [paidOn, setPaidOn] = useState(() => todayIso());
  const [note, setNote] = useState('');

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!paidOn || counting || markPaid.isPending) return;
    markPaid.mutate(
      {
        id: target.id,
        body: { paidOn, ...(note.trim() && { note: note.trim() }) },
      },
      { onSuccess: () => onDone() },
    );
  }

  return (
    <Modal
      title={s.markPaidTitle.replace('{recordNo}', target.no)}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={markPaid.isPending}
          >
            {t.common.cancel}
          </Button>
          <Button
            loading={markPaid.isPending}
            disabled={!paidOn || counting}
            onClick={() => submit()}
          >
            {s.markPaidConfirm}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <p className="text-sm text-slate">{target.summary}</p>
        <WholeRequestNote whole={whole} />
        <Field label={s.paidOnLabel} required>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          )}
        </Field>
        <Field label={s.noteLabel} hint={s.noteHint}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        {markPaid.isError && (
          <Banner tone="error">{actionErrorText(markPaid.error, t)}</Banner>
        )}
      </form>
    </Modal>
  );
}

function MarkUnpaidDialog({
  target,
  onClose,
  onDone,
}: {
  target: ActionTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const recordAction = useMarkUnpaid();
  const requestAction = useMarkRequestUnpaid();
  const markUnpaid = target.kind === 'request' ? requestAction : recordAction;
  const whole = useWholeRequest(target);
  return (
    <Modal
      title={s.markUnpaidTitle.replace('{recordNo}', target.no)}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={markUnpaid.isPending}
          >
            {t.common.cancel}
          </Button>
          <Button
            loading={markUnpaid.isPending}
            disabled={Boolean(whole?.loading)}
            onClick={() =>
              markUnpaid.mutate(
                { id: target.id },
                { onSuccess: () => onDone() },
              )
            }
          >
            {s.markUnpaidConfirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-slate">{target.summary}</p>
        <WholeRequestNote whole={whole} />
        <p>
          {wholeRequest(target) ? s.requestMarkUnpaidBody : s.markUnpaidBody}
        </p>
        {markUnpaid.isError && (
          <Banner tone="error">{actionErrorText(markUnpaid.error, t)}</Banner>
        )}
      </div>
    </Modal>
  );
}

function GrantSeasonPassDialog({
  row,
  season,
  onClose,
  onDone,
}: {
  row: AdminInsuranceSummary;
  season: string;
  onClose: () => void;
  onDone: (record: AdminInsuranceRecord) => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const { locale } = useLocale();
  const grant = useGrantSeasonPass();
  const [note, setNote] = useState('');
  const [markPaid, setMarkPaid] = useState(false);
  const [paidOn, setPaidOn] = useState(() => todayIso());
  const name = rowLabel(row, locale);
  const owed = dollars(row.owedCents);
  const amount = dollars(Math.max(0, CAP_CENTS - row.owedCents));
  const ready = !markPaid || Boolean(paidOn);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || grant.isPending) return;
    grant.mutate(
      {
        instructorId: row.instructorId,
        body: {
          season,
          ...(note.trim() && { note: note.trim() }),
          ...(markPaid && { paidOn }),
        },
      },
      { onSuccess: onDone },
    );
  }

  const code = grant.isError ? errorCodeOf(grant.error) : null;
  const grantError = !grant.isError
    ? null
    : code === 'already_covered'
      ? s.grantAlreadyCovered
      : code === 'already_has_pass'
        ? s.grantAlreadyHasPass
        : code === 'not_approved'
          ? s.grantNotApproved
          : errorText(grant.error, t.errors.generic);

  return (
    <Modal
      title={s.grantTitle.replace('{name}', name)}
      privateTitle
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={grant.isPending}>
            {t.common.cancel}
          </Button>
          <Button
            loading={grant.isPending}
            disabled={!ready}
            onClick={() => submit()}
          >
            {s.grantConfirm.replace('{amount}', amount)}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 rounded-md bg-sunken px-4 py-3 text-sm">
          <dt className="font-semibold text-navy">
            {s.grantAmount.replace('{owed}', owed)}
          </dt>
          <dd
            data-testid="grant-amount"
            className="text-right text-lg font-bold tabular-nums text-navy"
          >
            {amount}
          </dd>
        </dl>
        <p className="text-sm text-slate">
          {s.grantBody.replace('{owed}', owed).replace('{season}', season)}
        </p>
        <Field label={s.noteLabel} hint={s.grantNoteHint}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--navy)]"
            checked={markPaid}
            onChange={(e) => setMarkPaid(e.target.checked)}
          />
          {s.grantMarkPaid}
        </label>
        {markPaid && (
          <Field label={s.paidOnLabel} required>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            )}
          </Field>
        )}
        {grantError && <Banner tone="error">{grantError}</Banner>}
      </form>
    </Modal>
  );
}

function VoidDialog({
  target,
  title,
  summary,
  body,
  confirm,
  onClose,
  onDone,
}: {
  target: Pick<ActionTarget, 'kind' | 'id' | 'request'>;
  title: string;
  summary: string;
  body: string;
  confirm: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const recordAction = useVoidRecord();
  const requestAction = useVoidRequest();
  const voidRecord = target.kind === 'request' ? requestAction : recordAction;
  const whole = useWholeRequest(target);
  const counting = Boolean(whole?.loading);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = !reason.trim();

  function submit(e?: FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (missing || counting || voidRecord.isPending) return;
    voidRecord.mutate(
      { id: target.id, body: { reason: reason.trim() } },
      { onSuccess: () => onDone() },
    );
  }

  return (
    <Modal
      title={title}
      privateTitle
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={voidRecord.isPending}
          >
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            loading={voidRecord.isPending}
            disabled={(touched && missing) || counting}
            onClick={() => submit()}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <p data-private className="text-sm text-slate">
          {summary}
        </p>
        <WholeRequestNote whole={whole} />
        <p className="text-sm">{body}</p>
        <Field
          label={s.voidReason}
          required
          error={touched && missing ? s.voidReasonRequired : undefined}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        {voidRecord.isError && (
          <Banner tone="error">{actionErrorText(voidRecord.error, t)}</Banner>
        )}
      </form>
    </Modal>
  );
}
