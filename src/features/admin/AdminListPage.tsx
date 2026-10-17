import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { formatDate } from '@/lib/date';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  Banner,
  Button,
  Card,
  DotPill,
  EmptyState,
  Input,
  Pager,
  Select,
  Spinner,
  StatusPill,
} from '@/components';
import { INSTRUCTORS_PAGE_SIZE, useAdminInstructorPage } from './api';
import type { AdminInstructorRecord, ApprovalStatus } from '@/lib/types';

const SEARCH_DEBOUNCE_MS = 200;
const STATUSES: readonly ApprovalStatus[] = ['pending', 'approved', 'rejected'];

interface ListUpdate {
  q?: string;
  status?: ApprovalStatus | null;
  active?: boolean | null;
  calendar?: boolean | null;
  page?: number;
}

function pageFrom(params: URLSearchParams): number {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page > 1 ? page : 1;
}

function statusFrom(params: URLSearchParams): ApprovalStatus | undefined {
  const status = params.get('status');
  return STATUSES.find((s) => s === status);
}

function booleanFrom(
  params: URLSearchParams,
  key: string,
): boolean | undefined {
  const value = params.get(key);
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

/** W2.7 / W3.4 — admin instructor list + filters; table on desktop, cards on mobile. */
export function AdminListPage() {
  const t = useT();
  const { locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = statusFrom(params);
  const active = booleanFrom(params, 'active');
  const calendarConnected = booleanFrom(params, 'calendar');
  const page = pageFrom(params);
  const [draft, setDraft] = useState(q);
  const committed = useRef(q);
  const results = useAdminInstructorPage({
    q,
    status,
    active,
    calendarConnected,
    page,
  });
  const instructors = results.data?.instructors ?? [];
  const total = results.data?.total ?? 0;
  const shownPage = results.data?.page ?? page;
  const busy = results.isPlaceholderData;

  const update = useCallback(
    (next: ListUpdate) => {
      if (next.q !== undefined) committed.current = next.q;
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          const set = (key: string, value: string | null | undefined) => {
            if (value === undefined) return;
            if (value) out.set(key, value);
            else out.delete(key);
            out.delete('page');
          };
          set('q', next.q);
          set('status', next.status);
          set(
            'active',
            next.active == null ? next.active : String(next.active),
          );
          set(
            'calendar',
            next.calendar == null ? next.calendar : String(next.calendar),
          );
          if (next.page !== undefined) {
            if (next.page > 1) out.set('page', String(next.page));
            else out.delete('page');
          }
          return out;
        },
        { replace: next.page === undefined },
      );
    },
    [setParams],
  );

  useEffect(() => {
    if (q !== committed.current) {
      committed.current = q;
      setDraft(q);
    }
  }, [q]);

  useEffect(() => {
    const next = draft.trim();
    if (next === committed.current) return;
    const timer = setTimeout(() => update({ q: next }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, update]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (next !== committed.current) update({ q: next });
  }

  const name = (r: AdminInstructorRecord) =>
    localizeField(r.displayNameEn, r.displayNameZh, locale) || '—';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{t.admin.listTitle}</h1>

      <div className="flex flex-wrap items-end gap-4">
        <form
          role="search"
          onSubmit={submit}
          className="flex min-w-[16rem] flex-1 items-end gap-2"
        >
          <label className="flex flex-1 flex-col gap-1 text-xs text-slate">
            {t.admin.searchLabel}
            <Input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <Button type="submit" variant="secondary">
            {t.admin.search}
          </Button>
        </form>
        <label className="flex flex-col gap-1 text-xs text-slate">
          {t.admin.filterStatus}
          <Select
            className="sm:w-44"
            value={status ?? ''}
            onChange={(e) =>
              update({
                status: (e.target.value || null) as ApprovalStatus | null,
              })
            }
          >
            <option value="">{t.admin.all}</option>
            <option value="pending">{t.status.pending}</option>
            <option value="approved">{t.status.approved}</option>
            <option value="rejected">{t.status.rejected}</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate">
          {t.admin.filterActive}
          <Select
            className="sm:w-44"
            value={active === undefined ? '' : String(active)}
            onChange={(e) =>
              update({
                active:
                  e.target.value === '' ? null : e.target.value === 'true',
              })
            }
          >
            <option value="">{t.admin.all}</option>
            <option value="true">{t.status.active}</option>
            <option value="false">{t.status.inactive}</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate">
          {t.admin.colCalendar}
          <Select
            className="sm:w-44"
            value={
              calendarConnected === undefined ? '' : String(calendarConnected)
            }
            onChange={(e) =>
              update({
                calendar:
                  e.target.value === '' ? null : e.target.value === 'true',
              })
            }
          >
            <option value="">{t.admin.all}</option>
            <option value="true">{t.admin.calendarConnected}</option>
            <option value="false">{t.admin.calendarNotConnected}</option>
          </Select>
        </label>
      </div>

      {results.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : results.isError ? (
        <Banner tone="error">
          {results.error instanceof ApiError
            ? results.error.message
            : t.errors.generic}
        </Banner>
      ) : instructors.length === 0 && page === 1 ? (
        <EmptyState title={t.admin.noInstructors} />
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              'flex flex-col gap-3 transition-opacity',
              busy && 'opacity-60',
            )}
            aria-busy={busy}
          >
            {/* Desktop table */}
            <Card className="hidden overflow-x-auto p-0 sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t.admin.listTitle}</caption>
                <thead>
                  <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                    <th className="px-4 py-3 font-medium">{t.admin.colName}</th>
                    <th className="px-4 py-3 font-medium">
                      {t.admin.colEmail}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {t.admin.colStatus}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {t.admin.colCalendar}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {t.admin.colApplied}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {instructors.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`fade-rise ${i % 2 ? 'bg-sunken' : ''}`}
                      style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/instructors/${row.id}`}
                          className="font-medium text-navy hover:underline"
                        >
                          {name(row)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate">
                        {row.email}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          status={row.approvalStatus}
                          isActive={row.isActive}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <CalendarStatus connected={row.calendarConnected} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate">
                        {formatDate(row.insertedAt, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {instructors.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate">
                  {t.admin.noInstructors}
                </p>
              )}
            </Card>

            {/* Mobile cards */}
            <div className="flex flex-col gap-3 sm:hidden">
              {instructors.map((row) => (
                <Link key={row.id} to={`/admin/instructors/${row.id}`}>
                  <Card className="fade-rise flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-navy">{name(row)}</span>
                      <StatusPill
                        status={row.approvalStatus}
                        isActive={row.isActive}
                      />
                    </div>
                    <span className="font-mono text-xs text-slate">
                      {row.email}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-slate">
                      {t.admin.colCalendar}
                      <CalendarStatus connected={row.calendarConnected} />
                    </div>
                    <span className="font-mono text-xs text-slate">
                      {formatDate(row.insertedAt, locale)}
                    </span>
                  </Card>
                </Link>
              ))}
              {instructors.length === 0 && (
                <p className="py-6 text-center text-sm text-slate">
                  {t.admin.noInstructors}
                </p>
              )}
            </div>
          </div>

          <Card className="p-0">
            <Pager
              page={page}
              shownPage={shownPage}
              pageSize={INSTRUCTORS_PAGE_SIZE}
              count={instructors.length}
              total={total}
              busy={busy}
              onPage={(next) => update({ page: next })}
              text={{
                label: t.admin.pagination,
                showing: t.admin.showing,
                previous: t.admin.prevPage,
                next: t.admin.nextPage,
              }}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function CalendarStatus({ connected }: { connected: boolean }) {
  const t = useT();
  return connected ? (
    <DotPill
      color="var(--status-approved)"
      textClass="text-status-approved"
      label={t.admin.calendarConnected}
    />
  ) : (
    <DotPill
      color="var(--status-pending)"
      textClass="text-status-pending"
      label={t.admin.calendarNotConnected}
    />
  );
}
