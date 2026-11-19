import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Banner,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Pager,
  Select,
  Spinner,
  Textarea,
} from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Locale, Messages } from '@/i18n/core/types';
import { cn } from '@/lib/cn';
import { SCHOOL_TIME_ZONE } from '@/features/admin/booking/bookingRules';
import { Chip } from '@/features/documents/admin/badges';
import { errorText } from '@/features/documents/admin/format';
import {
  BUG_REPORTS_PAGE_SIZE,
  useBugReport,
  useBugReports,
  useUpdateBugReport,
} from './adminApi';
import type {
  BugReportDetail,
  BugReportItem,
  BugReportStatus,
  BugSeverity,
} from './types';

export const ADMIN_NOTE_MAX = 2000;

const STATUSES: BugReportStatus[] = [
  'new',
  'in_progress',
  'resolved',
  'wont_fix',
];

const STATUS_LABEL: Record<
  BugReportStatus,
  'statusNew' | 'statusInProgress' | 'statusResolved' | 'statusWontFix'
> = {
  new: 'statusNew',
  in_progress: 'statusInProgress',
  resolved: 'statusResolved',
  wont_fix: 'statusWontFix',
};

const STATUS_TONE = {
  new: 'pending',
  in_progress: 'navy',
  resolved: 'approved',
  wont_fix: 'neutral',
} as const;

const SEVERITY_LABEL: Record<
  BugSeverity,
  'severityBlocked' | 'severityWrong' | 'severityMinor'
> = {
  blocked: 'severityBlocked',
  wrong: 'severityWrong',
  minor: 'severityMinor',
};

const SEVERITY_TONE = {
  blocked: 'rejected',
  wrong: 'pending',
  minor: 'neutral',
} as const;

function parseStatus(value: string | null): BugReportStatus | null {
  return STATUSES.find((status) => status === value) ?? null;
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function torontoDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-CA', {
    timeZone: SCHOOL_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function ownOriginPath(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}`
      : null;
  } catch {
    return null;
  }
}

function roleLabel(role: BugReportItem['reporter']['role'], t: Messages) {
  return role === 'admin'
    ? t.bugReports.roleAdmin
    : t.bugReports.roleInstructor;
}

function SeverityChip({ severity }: { severity: BugSeverity | null }) {
  const t = useT();
  return severity ? (
    <Chip
      tone={SEVERITY_TONE[severity]}
      label={t.bugReport[SEVERITY_LABEL[severity]]}
    />
  ) : (
    <Chip tone="neutral" label={t.bugReports.noSeverity} />
  );
}

function ScreenshotIcon({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label} title={label} className="text-slate">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <rect x="2.5" y="4" width="15" height="12" rx="2" />
        <circle cx="7.5" cy="8.5" r="1.5" />
        <path d="m4 14 4-3.5 3 2.5 2.5-2 3 3" />
      </svg>
    </span>
  );
}

export function BugReportsPage() {
  const t = useT();
  const s = t.bugReports;
  const { locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get('status'));
  const page = parsePage(params.get('page'));
  const [openId, setOpenId] = useState<string | null>(null);
  const reports = useBugReports(status, page);

  const show = (next: { status?: BugReportStatus | null; page?: number }) => {
    const nextStatus = next.status === undefined ? status : next.status;
    const nextPage = next.page ?? 1;
    const query = new URLSearchParams();
    if (nextStatus) query.set('status', nextStatus);
    if (nextPage > 1) query.set('page', String(nextPage));
    setParams(query);
  };

  const shownPage = reports.data?.page ?? page;
  const items = reports.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-1">
        <h1 className="text-3xl">{s.title}</h1>
        <p className="text-slate">{s.intro}</p>
      </div>
      <div
        role="tablist"
        aria-label={s.tabsLabel}
        className="flex gap-1 overflow-x-auto border-b border-grey/60"
      >
        {[null, ...STATUSES].map((tab) => (
          <button
            key={tab ?? 'all'}
            type="button"
            role="tab"
            aria-selected={status === tab}
            onClick={() => show({ status: tab })}
            className={cn(
              'min-h-11 whitespace-nowrap border-b-2 px-3 text-sm transition-colors',
              status === tab
                ? 'border-red font-medium text-navy'
                : 'border-transparent text-slate hover:text-navy',
            )}
          >
            {tab ? s[STATUS_LABEL[tab]] : s.all}
          </button>
        ))}
      </div>
      {reports.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : reports.isError ? (
        <Banner tone="error">
          {errorText(reports.error, t.errors.generic)}
        </Banner>
      ) : items.length === 0 ? (
        <EmptyState title={s.empty} />
      ) : (
        <Card className="p-0">
          <ul
            aria-label={s.listLabel}
            aria-busy={reports.isPlaceholderData}
            data-private
            className={cn(
              'divide-y divide-grey/40 transition-opacity',
              reports.isPlaceholderData && 'opacity-60',
            )}
          >
            {items.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(report.id)}
                  className="flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-navy-tint/50 focus-visible:bg-navy-tint/50 focus-visible:outline-none"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <SeverityChip severity={report.severity} />
                    {!status && (
                      <Chip
                        tone={STATUS_TONE[report.status]}
                        label={s[STATUS_LABEL[report.status]]}
                      />
                    )}
                    {report.hasScreenshot && (
                      <ScreenshotIcon label={s.hasScreenshot} />
                    )}
                  </span>
                  <span className="truncate font-medium text-ink">
                    {report.description}
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate">
                    <span>
                      {report.reporter.name} ·{' '}
                      {roleLabel(report.reporter.role, t)}
                    </span>
                    <span>{torontoDateTime(report.createdAt, locale)}</span>
                    <span className="break-all font-mono">
                      {ownOriginPath(report.pageUrl) ?? report.pageUrl}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pager
            className="border-t border-grey/40"
            page={page}
            shownPage={shownPage}
            pageSize={BUG_REPORTS_PAGE_SIZE}
            count={items.length}
            total={reports.data?.total ?? 0}
            busy={reports.isFetching}
            onPage={(next) => show({ page: next })}
            text={{
              label: s.pagerLabel,
              showing: s.pagerShowing,
              previous: s.previous,
              next: s.next,
            }}
          />
        </Card>
      )}
      {openId && <BugReportPanel id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function BugReportPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const report = useBugReport(id);
  return (
    <Drawer title={t.bugReports.detailTitle} onClose={onClose}>
      {report.data ? (
        <BugReportView report={report.data} />
      ) : report.isError ? (
        <Banner tone="error">
          {errorText(report.error, t.bugReports.loadFailed)}
        </Banner>
      ) : (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
    </Drawer>
  );
}

function BugReportView({ report }: { report: BugReportDetail }) {
  const t = useT();
  const s = t.bugReports;
  const { locale } = useLocale();
  const ownPath = ownOriginPath(report.pageUrl);
  const environment = [
    [s.appVersion, report.appVersion],
    [s.viewport, report.viewport],
    [s.userAgent, report.userAgent],
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div data-private className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={report.severity} />
          <Chip
            tone={STATUS_TONE[report.status]}
            label={s[STATUS_LABEL[report.status]]}
          />
        </div>
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-navy">{s.whatHappened}</h3>
          <p className="whitespace-pre-wrap break-words text-ink">
            {report.description}
          </p>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-navy">{s.expected}</h3>
          <p
            className={cn(
              'whitespace-pre-wrap break-words',
              report.expected ? 'text-ink' : 'text-slate',
            )}
          >
            {report.expected ?? s.nothingExpected}
          </p>
        </section>
        <dl className="grid grid-cols-[minmax(0,8rem)_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-slate">{s.reported}</dt>
          <dd>{torontoDateTime(report.createdAt, locale)}</dd>
          <dt className="text-slate">{s.reporter}</dt>
          <dd className="break-words">
            {report.reporter.name} · {roleLabel(report.reporter.role, t)}
            {report.reporter.email && (
              <span className="block font-mono text-xs text-slate">
                {report.reporter.email}
              </span>
            )}
          </dd>
          <dt className="text-slate">{s.page}</dt>
          <dd className="break-all font-mono text-xs">
            {ownPath ? (
              <Link to={ownPath} className="text-navy underline">
                {report.pageUrl}
              </Link>
            ) : (
              report.pageUrl
            )}
          </dd>
          {environment.map(([label, value]) => (
            <EnvironmentRow key={label} label={label} value={value} />
          ))}
        </dl>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-navy">{s.screenshot}</h3>
          {report.screenshotUrl ? (
            <a
              href={report.screenshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.openScreenshot}
              title={s.openScreenshot}
              className="self-start"
            >
              <img
                data-private
                src={report.screenshotUrl}
                alt={s.screenshotAlt}
                className="max-h-80 max-w-full rounded-md border border-grey object-contain"
              />
            </a>
          ) : (
            <p className="text-sm text-slate">
              {report.hasScreenshot ? s.screenshotUnavailable : s.noScreenshot}
            </p>
          )}
        </section>
      </div>
      <TriageForm key={report.id} report={report} />
    </div>
  );
}

function EnvironmentRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const t = useT();
  return (
    <>
      <dt className="text-slate">{label}</dt>
      <dd
        className={cn(
          'break-all font-mono text-xs',
          !value && 'font-sans text-sm text-slate',
        )}
      >
        {value ?? t.bugReports.notRecorded}
      </dd>
    </>
  );
}

function TriageForm({ report }: { report: BugReportDetail }) {
  const t = useT();
  const s = t.bugReports;
  const update = useUpdateBugReport(report.id);
  const [status, setStatus] = useState(report.status);
  const [note, setNote] = useState(report.adminNote ?? '');
  const savedNote = report.adminNote ?? '';
  const statusChanged = status !== report.status;
  const noteChanged = note.trim() !== savedNote;

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (update.isPending || (!statusChanged && !noteChanged)) return;
    update.mutate({
      ...(statusChanged && { status }),
      ...(noteChanged && { adminNote: note.trim() || null }),
    });
  };

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-4 border-t border-grey/60 pt-4"
    >
      <Field label={s.status}>
        {(a11y) => (
          <Select
            {...a11y}
            value={status}
            onChange={(e) => {
              setStatus(parseStatus(e.target.value) ?? report.status);
              update.reset();
            }}
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {s[STATUS_LABEL[option]]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={s.adminNote} hint={s.adminNoteHint}>
        {(a11y) => (
          <Textarea
            {...a11y}
            data-private
            rows={4}
            maxLength={ADMIN_NOTE_MAX}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              update.reset();
            }}
          />
        )}
      </Field>
      {update.isError && (
        <Banner tone="error">
          {s.saveFailed.replace(
            '{reason}',
            errorText(update.error, t.errors.generic),
          )}
        </Banner>
      )}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          loading={update.isPending}
          disabled={!statusChanged && !noteChanged}
        >
          {s.save}
        </Button>
        {update.isSuccess && (
          <span role="status" className="text-sm text-status-approved">
            {s.saved}
          </span>
        )}
      </div>
    </form>
  );
}
