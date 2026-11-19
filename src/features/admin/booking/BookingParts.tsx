import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { useSession } from '@/auth/SessionProvider';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { api } from '@/lib/api';
import { Banner, Button, Field, Input } from '@/components';
import { cn } from '@/lib/cn';
import { useModalFocus } from '@/lib/useModalFocus';
import type { Customer, CustomerWaiver } from '@/lib/types';
import { WaiverBadge } from '@/features/documents/lookups/WaiverBadge';
import { CreateCustomerCard } from '../CustomersPage';
import { customerName } from '../lessonRules';
import {
  bookingProblem,
  formatSchoolDateTime,
  formatSchoolTime,
} from './bookingRules';
import type { BookingWarning } from './types';

export type PickedCustomer = Pick<
  Customer,
  'id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'waiver'
>;

const TYPEAHEAD_DELAY_MS = 150;
const TYPEAHEAD_MIN = 2;
const TYPEAHEAD_LIMIT = 20;
const WAIVER_LOOKUP_MAX_IDS = 50;

export function Dialog({
  title,
  onClose,
  dismissible = true,
  children,
}: {
  title: string;
  onClose: () => void;
  dismissible?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, {
    onEscape: () => {
      if (dismissible) onClose();
    },
  });
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(28,34,51,0.4)] p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-surface p-5 shadow-pop focus:outline-none"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={id} className="text-xl">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={!dismissible}
            onClick={onClose}
            aria-label={t.booking.close}
          >
            ×
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function useCustomerTypeahead(q: string) {
  return useQuery({
    queryKey: ['admin', 'customers', q] as const,
    enabled: q.length >= TYPEAHEAD_MIN,
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<Customer[]>(`/admin/customers?${new URLSearchParams({ q })}`),
  });
}

type WaiverWaiter = {
  resolve: (waiver: CustomerWaiver | null) => void;
  reject: (error: unknown) => void;
};

let waiverQueue = new Map<string, WaiverWaiter[]>();

async function fetchWaivers(
  ids: string[],
  waiters: Map<string, WaiverWaiter[]>,
) {
  try {
    const rows = await api<Customer[]>(
      `/admin/customers?${new URLSearchParams({ ids: ids.join(',') })}`,
    );
    const byId = new Map(rows.map((row) => [row.id, row.waiver ?? null]));
    for (const id of ids)
      for (const w of waiters.get(id) ?? []) w.resolve(byId.get(id) ?? null);
  } catch (error) {
    for (const id of ids)
      for (const w of waiters.get(id) ?? []) w.reject(error);
  }
}

function flushWaiverQueue() {
  const waiters = waiverQueue;
  waiverQueue = new Map();
  const ids = [...waiters.keys()];
  for (let i = 0; i < ids.length; i += WAIVER_LOOKUP_MAX_IDS)
    void fetchWaivers(ids.slice(i, i + WAIVER_LOOKUP_MAX_IDS), waiters);
}

function loadWaiver(id: string): Promise<CustomerWaiver | null> {
  return new Promise((resolve, reject) => {
    if (waiverQueue.size === 0) queueMicrotask(flushWaiverQueue);
    waiverQueue.set(id, [...(waiverQueue.get(id) ?? []), { resolve, reject }]);
  });
}

function useWithWaivers(selected: PickedCustomer[]): PickedCustomer[] {
  const userId = useSession().user?.id ?? null;
  const lookups = useQueries({
    queries: selected.map((c) => ({
      queryKey: ['admin', 'customers', 'waiver', userId, c.id] as const,
      enabled: userId !== null && !c.waiver,
      retry: false,
      queryFn: () => loadWaiver(c.id),
    })),
  });
  return selected.map((c, i) =>
    c.waiver ? c : { ...c, waiver: lookups[i]?.data ?? undefined },
  );
}

export function pickedName(c: PickedCustomer): string {
  return customerName(c) || c.email || c.phone || '—';
}

function MissingWaiverNote({ selected }: { selected: PickedCustomer[] }) {
  const t = useT();
  const missing = selected.filter(
    (c) => c.waiver && c.waiver.status !== 'signed',
  );
  const year = missing[0]?.waiver?.year;
  if (!year) return null;
  return (
    <p className="rounded-md border-l-[3px] border-l-status-pending bg-status-pending/10 px-3 py-2 text-sm text-ink">
      {t.waiver.missingNote
        .replace('{year}', year)
        .replace('{names}', missing.map(pickedName).join(', '))}
    </p>
  );
}

export function CustomerPicker({
  selected,
  onChange,
  forBooking = true,
  disabled = false,
}: {
  selected: PickedCustomer[];
  onChange: (next: PickedCustomer[]) => void;
  forBooking?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  const listId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useDebounced(draft.trim(), TYPEAHEAD_DELAY_MS);
  const results = useCustomerTypeahead(q);
  const [active, setActive] = useState({ q: '', index: -1 });
  const [dismissed, setDismissed] = useState(false);
  const shown = useWithWaivers(selected);
  const chosen = new Set(selected.map((c) => c.id));
  const data = results.data;
  const options = (data ?? []).filter((c) => !chosen.has(c.id));
  const open = draft.trim().length >= TYPEAHEAD_MIN;
  const settled = !results.isPlaceholderData && q === draft.trim();
  const showList = open && !dismissed && !results.isError && options.length > 0;
  const activeIndex =
    showList && active.q === q && active.index < options.length
      ? active.index
      : -1;
  const optionId = (index: number) => `${listId}-${index}`;

  function add(customer: PickedCustomer) {
    if (disabled) return;
    onChange([...selected, customer]);
    setDraft('');
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (showList) {
        e.preventDefault();
        setDismissed(true);
      } else if (draft) {
        e.preventDefault();
        setDraft('');
      }
      return;
    }
    if (!showList) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next =
        activeIndex === -1 && step === -1
          ? options.length - 1
          : (activeIndex + step + options.length) % options.length;
      setActive({ q, index: next });
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const pick = options[activeIndex];
      if (pick) add(pick);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {selected.length > 0 && (
        <ul
          data-private
          aria-label={t.booking.selectedCustomers}
          className="flex flex-wrap gap-2"
        >
          {shown.map((c) => (
            <li
              key={c.id}
              className="flex min-h-11 max-w-full items-center gap-1 rounded-md bg-navy-tint pl-3 text-sm text-navy"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                {pickedName(c)}
                {c.waiver && <WaiverBadge waiver={c.waiver} />}
              </span>
              <button
                type="button"
                className="min-h-11 min-w-11 rounded-md hover:bg-grey disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
                aria-label={t.booking.removeCustomer.replace(
                  '{name}',
                  pickedName(c),
                )}
                onClick={() => onChange(selected.filter((s) => s.id !== c.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {forBooking && <MissingWaiverNote selected={shown} />}
      <div className="grid gap-1.5 sm:grid-cols-[1fr_auto] sm:gap-x-2">
        <Field label={t.booking.customerSearch}>
          {(p) => (
            <Input
              {...p}
              type="search"
              role="combobox"
              autoComplete="off"
              aria-describedby={hintId}
              aria-autocomplete="list"
              aria-expanded={showList}
              aria-controls={showList ? listId : undefined}
              aria-activedescendant={
                activeIndex >= 0 ? optionId(activeIndex) : undefined
              }
              value={draft}
              disabled={disabled}
              onChange={(e) => {
                setDraft(e.target.value);
                setDismissed(false);
              }}
              onKeyDown={onKeyDown}
            />
          )}
        </Field>
        <p
          id={hintId}
          className="text-sm text-slate sm:col-start-1 sm:row-start-2"
        >
          {t.booking.customerSearchHint}
        </p>
        {forBooking && (
          <Button
            variant="secondary"
            type="button"
            disabled={disabled}
            onClick={() => setCreating(true)}
            className="mt-2.5 justify-self-start sm:col-start-2 sm:row-start-1 sm:mt-0 sm:self-end"
          >
            {t.booking.newCustomer}
          </Button>
        )}
      </div>
      {open &&
        !dismissed &&
        (results.isError ? (
          <Banner tone="error">{t.errors.generic}</Banner>
        ) : options.length === 0 ? (
          <p role="status" className="text-sm text-slate">
            {data && settled
              ? t.booking.noCustomerMatch
              : t.booking.customerSearching}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <ul
              data-private
              id={listId}
              role="listbox"
              aria-label={t.booking.customerResults}
              className="divide-y divide-grey/40 rounded-md border border-grey/60"
            >
              {options.map((c, index) => (
                <li
                  key={c.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cn(
                    'flex w-full cursor-pointer flex-wrap gap-x-2 px-3 py-2 text-left text-sm hover:bg-navy-tint',
                    index === activeIndex && 'bg-navy-tint',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(c)}
                >
                  <span className="font-medium text-ink">{pickedName(c)}</span>
                  {c.email && <span className="text-slate">{c.email}</span>}
                  {c.phone && (
                    <span className="font-mono text-xs text-slate">
                      {c.phone}
                    </span>
                  )}
                  {c.waiver && <WaiverBadge waiver={c.waiver} />}
                </li>
              ))}
            </ul>
            {(data?.length ?? 0) >= TYPEAHEAD_LIMIT && (
              <p className="text-sm text-slate">
                {t.booking.customerResultsCapped.replace(
                  '{n}',
                  String(TYPEAHEAD_LIMIT),
                )}
              </p>
            )}
          </div>
        ))}
      {creating && (
        <Dialog
          title={t.booking.newCustomer}
          onClose={() => setCreating(false)}
        >
          <div className="[&>div]:border-0 [&>div]:p-0 [&>div]:shadow-none [&_form>button]:self-end [&_form>h2]:hidden">
            <CreateCustomerCard
              onCreated={(customer) => {
                add(customer);
                setCreating(false);
              }}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function BookingErrorBanner({ error }: { error: unknown }) {
  const t = useT();
  const { locale } = useLocale();
  const problem = bookingProblem(error);
  if (problem.kind === 'conflict') {
    return (
      <Banner tone="error" title={t.booking.conflictTitle}>
        {problem.conflicts.length === 0 ? (
          <p>{t.booking.conflictRace}</p>
        ) : (
          <ul className="list-disc pl-5">
            {problem.conflicts.map((c, i) => (
              <li key={i}>
                {t.booking.conflictLine
                  .replace('{when}', formatSchoolDateTime(c.startsAt, locale))
                  .replace('{from}', formatSchoolTime(c.busyStart, locale))
                  .replace('{to}', formatSchoolTime(c.busyEnd, locale))
                  .replace(
                    '{source}',
                    c.source === 'google'
                      ? t.booking.sourceGoogle
                      : t.booking.sourceSsms,
                  )}
              </li>
            ))}
          </ul>
        )}
      </Banner>
    );
  }
  if (problem.kind === 'misaligned') {
    return <Banner tone="error">{t.booking.errStartNotAligned}</Banner>;
  }
  if (problem.kind === 'google') {
    const code = [problem.status, problem.reason].filter(Boolean).join(' ');
    return (
      <Banner tone="error" title={t.booking.googleFailedTitle}>
        {t.booking.googleFailed.replace('{code}', code || '—')}
      </Banner>
    );
  }
  return (
    <Banner tone="error">
      {problem.kind === 'message' ? problem.message : t.errors.generic}
    </Banner>
  );
}

export function SendEmailsField({
  label,
  checked,
  past,
  onChange,
}: {
  label: string;
  checked: boolean;
  past: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useT();
  if (past)
    return <p className="text-sm text-slate">{t.booking.pastNoEmails}</p>;
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        role="switch"
        className="h-5 w-5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function warningLines(
  t: Messages,
  warnings: BookingWarning[] | undefined,
  names: {
    customer: (id: string) => string | null;
    instructor: (id: string) => string | null;
  },
): string[] {
  const lines = (warnings ?? []).map((w) => {
    if (w.code === 'customer_email_missing')
      return t.booking.warningNoEmail.replace(
        '{name}',
        (w.customerId && names.customer(w.customerId)) || t.booking.theCustomer,
      );
    if (w.code === 'instructor_email_missing')
      return t.booking.warningNoEmail.replace(
        '{name}',
        (w.instructorId && names.instructor(w.instructorId)) ||
          t.booking.theInstructor,
      );
    return w.message;
  });
  return [...new Set(lines)];
}

export function WarningsBanner({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) {
  if (lines.length === 0) return null;
  return (
    <Banner tone="pending" title={title}>
      <ul data-private className="list-disc pl-5">
        {lines.map((line) => (
          <li key={line} className="break-words">
            {line}
          </li>
        ))}
      </ul>
    </Banner>
  );
}
