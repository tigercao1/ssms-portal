import { useState, type FormEvent } from 'react';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Pager,
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
  studentNames,
} from '@/features/insurance/InsuranceRecords';
import { CAP_CENTS, dollars } from '@/features/insurance/money';
import { useToast } from '@/features/insurance/Toast';
import type {
  AdminInsuranceRecord,
  AdminInsuranceSummary,
  InsurancePaymentStatus,
  SeasonCoverage,
} from '@/features/insurance/types';
import { errorCodeOf } from '@/features/insurance/api';
import { errorText, formatDay } from '../payroll/payrollFormat';
import {
  useGrantSeasonPass,
  useInsuranceRecords,
  useInsuranceSummary,
  useMarkPaid,
  useMarkUnpaid,
  useVoidRecord,
} from './insuranceApi';

export const INSURANCE_PAGE_SIZE = 25;

const STATUSES: InsurancePaymentStatus[] = [
  'unpaid',
  'paid',
  'not_required',
  'voided',
];

type Dialog =
  | { kind: 'paid' | 'unpaid' | 'void'; record: AdminInsuranceRecord }
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
  const [dialog, setDialog] = useState<Dialog>(null);
  const { toast, showToast } = useToast();
  const summary = useInsuranceSummary(season);
  const records = useInsuranceRecords({
    season,
    instructorId: instructorId || undefined,
    paymentStatus: status || undefined,
    page,
    limit: INSURANCE_PAGE_SIZE,
  });

  function changeSeason(key: string) {
    setPickedSeason(key);
    setInstructorId('');
    setPage(1);
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
          setPage(1);
        }}
        onAction={setDialog}
      />

      <section
        aria-labelledby="insurance-records"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="insurance-records" className="text-xl">
            {s.recordsTitle}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Field label={s.filterInstructor}>
              {(p) => (
                <Select
                  {...p}
                  className="w-56"
                  value={instructorId}
                  onChange={(e) => {
                    setInstructorId(e.target.value);
                    setPage(1);
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
                  className="w-44"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as InsurancePaymentStatus | '');
                    setPage(1);
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
        <RecordsTable
          query={records}
          waiting={seasons.isLoading}
          page={page}
          onPage={setPage}
          onAction={setDialog}
        />
      </section>

      {dialog?.kind === 'paid' && (
        <MarkPaidDialog
          record={dialog.record}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            showToast(s.markPaidToast.replace('{recordNo}', r.recordNo));
          }}
        />
      )}
      {dialog?.kind === 'unpaid' && (
        <MarkUnpaidDialog
          record={dialog.record}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            showToast(s.markUnpaidToast.replace('{recordNo}', r.recordNo));
          }}
        />
      )}
      {dialog?.kind === 'void' && (
        <VoidDialog
          recordId={dialog.record.id}
          title={s.voidTitle.replace('{recordNo}', dialog.record.recordNo)}
          summary={recordSummary(dialog.record, locale)}
          body={s.voidBody}
          confirm={s.voidConfirm}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            showToast(s.voidToast.replace('{recordNo}', r.recordNo));
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
          recordId={dialog.row.seasonPassRecordId}
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

function RecordsTable({
  query,
  waiting,
  page,
  onPage,
  onAction,
}: {
  query: ReturnType<typeof useInsuranceRecords>;
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
                  <td className={cn(td, 'font-mono text-xs')}>{r.recordNo}</td>
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
                    <div
                      role="group"
                      aria-label={s.actionsFor.replace(
                        '{recordNo}',
                        r.recordNo,
                      )}
                      className="flex flex-col items-end gap-1.5"
                    >
                      {r.paymentStatus === 'unpaid' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onAction({ kind: 'paid', record: r })}
                        >
                          {s.markPaid}
                        </Button>
                      )}
                      {r.paymentStatus === 'paid' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            onAction({ kind: 'unpaid', record: r })
                          }
                        >
                          {s.markUnpaid}
                        </Button>
                      )}
                      {r.paymentStatus !== 'voided' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onAction({ kind: 'void', record: r })}
                        >
                          {s.void}
                        </Button>
                      )}
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
  record,
  onClose,
  onDone,
}: {
  record: AdminInsuranceRecord;
  onClose: () => void;
  onDone: (record: AdminInsuranceRecord) => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const { locale } = useLocale();
  const markPaid = useMarkPaid();
  const [paidOn, setPaidOn] = useState(() => todayIso());
  const [note, setNote] = useState('');

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!paidOn || markPaid.isPending) return;
    markPaid.mutate(
      {
        id: record.id,
        body: { paidOn, ...(note.trim() && { note: note.trim() }) },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <Modal
      title={s.markPaidTitle.replace('{recordNo}', record.recordNo)}
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
            disabled={!paidOn}
            onClick={() => submit()}
          >
            {s.markPaidConfirm}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <p className="text-sm text-slate">{recordSummary(record, locale)}</p>
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
          <Banner tone="error">
            {errorText(markPaid.error, t.errors.generic)}
          </Banner>
        )}
      </form>
    </Modal>
  );
}

function MarkUnpaidDialog({
  record,
  onClose,
  onDone,
}: {
  record: AdminInsuranceRecord;
  onClose: () => void;
  onDone: (record: AdminInsuranceRecord) => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const { locale } = useLocale();
  const markUnpaid = useMarkUnpaid();
  return (
    <Modal
      title={s.markUnpaidTitle.replace('{recordNo}', record.recordNo)}
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
            onClick={() =>
              markUnpaid.mutate({ id: record.id }, { onSuccess: onDone })
            }
          >
            {s.markUnpaidConfirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-slate">{recordSummary(record, locale)}</p>
        <p>{s.markUnpaidBody}</p>
        {markUnpaid.isError && (
          <Banner tone="error">
            {errorText(markUnpaid.error, t.errors.generic)}
          </Banner>
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
  recordId,
  title,
  summary,
  body,
  confirm,
  onClose,
  onDone,
}: {
  recordId: string;
  title: string;
  summary: string;
  body: string;
  confirm: string;
  onClose: () => void;
  onDone: (record: AdminInsuranceRecord) => void;
}) {
  const t = useT();
  const s = t.adminInsurance;
  const voidRecord = useVoidRecord();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = !reason.trim();

  function submit(e?: FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (missing || voidRecord.isPending) return;
    voidRecord.mutate(
      { id: recordId, body: { reason: reason.trim() } },
      { onSuccess: onDone },
    );
  }

  return (
    <Modal
      title={title}
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
            disabled={touched && missing}
            onClick={() => submit()}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <p className="text-sm text-slate">{summary}</p>
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
          <Banner tone="error">
            {errorText(voidRecord.error, t.errors.generic)}
          </Banner>
        )}
      </form>
    </Modal>
  );
}
