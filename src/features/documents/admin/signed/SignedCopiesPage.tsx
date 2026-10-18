import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/date';
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
import { useSeasons } from '@/features/reference/api';
import {
  downloadPresigned,
  getAssignmentSignedUrl,
  type Template,
  type TemplateAssignmentRow,
  type TemplateAssignmentStatusFilter,
} from '../../api';
import {
  SIGNED_COPIES_PAGE_SIZE,
  useTemplate,
  useTemplateAssignments,
} from '../hooks';
import { AssignmentStatusChip, KindBadge } from '../badges';
import { errorText, shortHash, templateTitle } from '../format';
import { ExportPanel } from './ExportPanel';

const SEARCH_DEBOUNCE_MS = 200;
const STATUS_FILTERS: TemplateAssignmentStatusFilter[] = [
  'all',
  'completed',
  'open',
];

interface Filters {
  season: string;
  status: TemplateAssignmentStatusFilter;
  q: string;
  page: number;
}

function filtersFrom(params: URLSearchParams): Filters {
  const page = Number(params.get('page'));
  const status = params.get('status') as TemplateAssignmentStatusFilter | null;
  return {
    season: params.get('season') ?? '',
    status: status && STATUS_FILTERS.includes(status) ? status : 'all',
    q: params.get('q') ?? '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function instructorName(row: TemplateAssignmentRow, t: Messages) {
  const { firstName, lastName } = row.instructor;
  return (
    [firstName, lastName].filter(Boolean).join(' ') || t.signedCopies.noName
  );
}

export function isSelectable(row: TemplateAssignmentRow) {
  return row.status === 'completed' && row.hasSignedCopy;
}

/** Admin list of every assignment of one template, with downloads and ZIP export. */
export function SignedCopiesPage() {
  const t = useT();
  const { id = '' } = useParams();
  const template = useTemplate(id);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/documents" className="text-sm text-navy hover:underline">
        ← {t.signedCopies.back}
      </Link>
      {template.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : template.isError ? (
        <Banner tone="error">
          {errorText(template.error, t.errors.generic)}
        </Banner>
      ) : template.data ? (
        <SignedCopies template={template.data} />
      ) : null}
    </div>
  );
}

function SignedCopies({ template }: { template: Template }) {
  const t = useT();
  const s = t.signedCopies;
  const { locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const filters = filtersFrom(params);
  const isSign = template.kind === 'sign';
  const [draft, setDraft] = useState(filters.q);
  const committed = useRef(filters.q);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const results = useTemplateAssignments(template.id, {
    season: filters.season || undefined,
    status: filters.status,
    q: filters.q || undefined,
    page: filters.page,
    limit: SIGNED_COPIES_PAGE_SIZE,
  });
  const rows = results.data?.rows ?? [];
  const total = results.data?.total ?? 0;
  const shownPage = results.data?.page ?? filters.page;
  const busy = results.isPlaceholderData;

  const update = useCallback(
    (next: Partial<Filters>) => {
      if (next.q !== undefined) committed.current = next.q;
      if (next.season !== undefined) setSelected(new Set());
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          for (const key of ['season', 'status', 'q'] as const) {
            const value = next[key];
            if (value === undefined) continue;
            if (value && value !== 'all') out.set(key, value);
            else out.delete(key);
            out.delete('page');
          }
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
    if (filters.q !== committed.current) {
      committed.current = filters.q;
      setDraft(filters.q);
    }
  }, [filters.q]);

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

  function toggle(rowId: string) {
    setSelected((cur) => {
      const out = new Set(cur);
      if (out.has(rowId)) out.delete(rowId);
      else out.add(rowId);
      return out;
    });
  }

  const selectable = isSign ? rows.filter(isSelectable) : [];
  const allOnPage =
    selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  function togglePage() {
    setSelected((cur) => {
      const out = new Set(cur);
      for (const r of selectable) {
        if (allOnPage) out.delete(r.id);
        else out.add(r.id);
      }
      return out;
    });
  }

  const title = templateTitle(template, locale);
  const unfiltered = !filters.season && filters.status === 'all' && !filters.q;

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
          <span>{isSign ? s.subtitle : s.subtitleRead}</span>
          <KindBadge kind={template.kind} />
        </div>
        <h1 className="text-3xl">{title}</h1>
        <p className="max-w-3xl text-slate">{isSign ? s.intro : s.introRead}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <form
            role="search"
            onSubmit={submit}
            className="grid gap-3 sm:grid-cols-2 md:grid-cols-[minmax(0,11rem)_minmax(0,11rem)_minmax(0,1fr)_auto] md:items-end"
          >
            <SeasonFilter
              value={filters.season}
              onChange={(season) => update({ season })}
            />
            <Field label={s.statusLabel}>
              {(p) => (
                <Select
                  {...p}
                  value={filters.status}
                  onChange={(e) =>
                    update({
                      status: e.target.value as TemplateAssignmentStatusFilter,
                    })
                  }
                >
                  <option value="all">{s.statusAll}</option>
                  <option value="completed">{s.statusCompleted}</option>
                  <option value="open">{s.statusOpen}</option>
                </Select>
              )}
            </Field>
            <Field label={s.searchLabel}>
              {(p) => (
                <Input
                  {...p}
                  type="search"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              )}
            </Field>
            <Button type="submit" variant="secondary">
              {s.search}
            </Button>
          </form>
        </Card>

        {isSign && (
          <ExportPanel
            templateId={template.id}
            season={filters.season}
            selected={selected}
            onClearSelection={() => setSelected(new Set())}
          />
        )}

        {results.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : results.isError ? (
          <Banner tone="error">
            {errorText(results.error, t.errors.generic)}
          </Banner>
        ) : rows.length === 0 && filters.page === 1 ? (
          <EmptyState title={unfiltered ? s.emptyNone : s.empty} />
        ) : (
          <Card className="p-0">
            <div
              className={cn('transition-opacity', busy && 'opacity-60')}
              aria-busy={busy}
            >
              <AssignmentTable
                rows={rows}
                isSign={isSign}
                selected={selected}
                allOnPage={allOnPage}
                canSelectPage={selectable.length > 0}
                onToggle={toggle}
                onTogglePage={togglePage}
              />
              <AssignmentCards
                rows={rows}
                isSign={isSign}
                selected={selected}
                onToggle={toggle}
              />
              {rows.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate">
                  {s.empty}
                </p>
              )}
            </div>
            <Pager
              page={filters.page}
              shownPage={shownPage}
              pageSize={SIGNED_COPIES_PAGE_SIZE}
              count={rows.length}
              total={total}
              busy={busy}
              onPage={(page) => update({ page })}
              className="border-t border-grey/60"
              text={{
                label: s.pagination,
                showing: s.showing,
                previous: s.prevPage,
                next: s.nextPage,
              }}
            />
          </Card>
        )}
      </div>
    </>
  );
}

function SeasonFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (season: string) => void;
}) {
  const t = useT();
  const seasons = useSeasons();
  const list = seasons.data ?? [];
  return (
    <Field label={t.signedCopies.seasonLabel}>
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t.signedCopies.allSeasons}</option>
          {value && !list.some((x) => x.key === value) && (
            <option value={value}>{value}</option>
          )}
          {list.map((x) => (
            <option key={x.key} value={x.key}>
              {x.isCurrent
                ? t.seasons.currentOption.replace('{key}', x.key)
                : x.key}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

interface RowsProps {
  rows: TemplateAssignmentRow[];
  isSign: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function AssignmentTable({
  rows,
  isSign,
  selected,
  allOnPage,
  canSelectPage,
  onToggle,
  onTogglePage,
}: RowsProps & {
  allOnPage: boolean;
  canSelectPage: boolean;
  onTogglePage: () => void;
}) {
  const t = useT();
  const s = t.signedCopies;
  const { locale } = useLocale();
  const th = 'px-3 py-2 font-medium';
  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
            {isSign && (
              <th className="w-px px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={s.selectPage}
                  checked={allOnPage}
                  disabled={!canSelectPage}
                  onChange={onTogglePage}
                />
              </th>
            )}
            <th className={th}>{s.colInstructor}</th>
            <th className={cn(th, 'w-px whitespace-nowrap')}>{s.colStatus}</th>
            <th className={th}>{isSign ? s.colSigner : s.colSignerRead}</th>
            <th className={cn(th, 'whitespace-nowrap')}>
              {isSign ? s.colSignedAt : s.colSignedAtRead}
            </th>
            <th className={cn(th, 'hidden whitespace-nowrap lg:table-cell')}>
              {s.colSeason}
            </th>
            {isSign && (
              <>
                <th
                  className={cn(th, 'hidden whitespace-nowrap lg:table-cell')}
                >
                  {s.colHash}
                </th>
                <th className={cn(th, 'text-right')}>
                  <span className="sr-only">{s.colDownload}</span>
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const name = instructorName(row, t);
            return (
              <tr
                key={row.id}
                className={cn(
                  selected.has(row.id)
                    ? 'bg-navy-tint'
                    : i % 2 === 1 && 'bg-sunken',
                )}
              >
                {isSign && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={s.selectRow.replace('{name}', name)}
                      checked={selected.has(row.id)}
                      disabled={!isSelectable(row)}
                      onChange={() => onToggle(row.id)}
                    />
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="font-medium text-ink">{name}</div>
                  <div className="break-all font-mono text-xs text-slate">
                    {row.instructor.email ?? '—'}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <AssignmentStatusChip status={row.status} />
                </td>
                <td className="px-3 py-2">{row.signerName ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  {row.completedAt
                    ? formatDateTime(row.completedAt, locale)
                    : '—'}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2 lg:table-cell">
                  {row.season ?? '—'}
                </td>
                {isSign && (
                  <>
                    <td
                      className="hidden whitespace-nowrap px-3 py-2 font-mono text-xs text-slate lg:table-cell"
                      title={row.signedSha256 ?? undefined}
                    >
                      {shortHash(row.signedSha256)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DownloadButton row={row} name={name} />
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AssignmentCards({ rows, isSign, selected, onToggle }: RowsProps) {
  const t = useT();
  const s = t.signedCopies;
  const { locale } = useLocale();
  return (
    <ul
      data-private
      className="flex flex-col divide-y divide-grey/40 sm:hidden"
    >
      {rows.map((row) => {
        const name = instructorName(row, t);
        return (
          <li
            key={row.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3',
              selected.has(row.id) && 'bg-navy-tint',
            )}
          >
            {isSign && (
              <input
                type="checkbox"
                className="mt-1"
                aria-label={s.selectRow.replace('{name}', name)}
                checked={selected.has(row.id)}
                disabled={!isSelectable(row)}
                onChange={() => onToggle(row.id)}
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">{name}</span>
                <AssignmentStatusChip status={row.status} />
              </div>
              <span className="break-all font-mono text-xs text-slate">
                {row.instructor.email ?? '—'}
              </span>
              {row.completedAt && (
                <span className="text-xs text-slate">
                  {row.signerName ?? '—'} ·{' '}
                  {formatDateTime(row.completedAt, locale)}
                </span>
              )}
              <span className="text-xs text-slate">
                {row.season ?? '—'}
                {isSign && row.signedSha256 && (
                  <span className="font-mono">
                    {' '}
                    · {shortHash(row.signedSha256)}
                  </span>
                )}
              </span>
              {isSign && (
                <div className="-ml-3">
                  <DownloadButton row={row} name={name} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DownloadButton({
  row,
  name,
}: {
  row: TemplateAssignmentRow;
  name: string;
}) {
  const t = useT();
  const s = t.signedCopies;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!isSelectable(row)) return null;

  async function download() {
    setError(null);
    setPending(true);
    try {
      await downloadPresigned(() => getAssignmentSignedUrl(row.id));
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        aria-label={s.downloadFor.replace('{name}', name)}
        onClick={download}
      >
        {s.download}
      </Button>
      {error !== null && (
        <p role="alert" className="mt-1 text-xs text-status-rejected">
          {s.downloadFailed.replace(
            '{reason}',
            errorText(error, t.errors.generic),
          )}
        </p>
      )}
    </>
  );
}
