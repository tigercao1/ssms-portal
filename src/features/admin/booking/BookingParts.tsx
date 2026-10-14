import {
  useEffect,
  useId,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { api } from '@/lib/api';
import { Banner, Button, Field, Input } from '@/components';
import { cn } from '@/lib/cn';
import type { Customer } from '@/lib/types';
import { CreateCustomerCard } from '../CustomersPage';
import { customerName } from '../lessonRules';
import {
  bookingProblem,
  formatSchoolDateTime,
  formatSchoolTime,
} from './bookingRules';

export type PickedCustomer = Pick<
  Customer,
  'id' | 'firstName' | 'lastName' | 'email' | 'phone'
>;

const TYPEAHEAD_DELAY_MS = 150;
const TYPEAHEAD_MIN = 2;
const TYPEAHEAD_LIMIT = 20;

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const id = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(28,34,51,0.4)] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-surface p-5 shadow-pop"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={id} className="text-xl">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={t.booking.close}
          >
            ×
          </Button>
        </div>
        {children}
      </div>
    </div>
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

export function pickedName(c: PickedCustomer): string {
  return customerName(c) || c.email || c.phone || '—';
}

export function CustomerPicker({
  selected,
  onChange,
}: {
  selected: PickedCustomer[];
  onChange: (next: PickedCustomer[]) => void;
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
          aria-label={t.booking.selectedCustomers}
          className="flex flex-wrap gap-2"
        >
          {selected.map((c) => (
            <li
              key={c.id}
              className="flex h-8 items-center gap-1 rounded-md bg-navy-tint pl-3 pr-1 text-sm text-navy"
            >
              {pickedName(c)}
              <button
                type="button"
                className="rounded-sm px-1.5 hover:bg-grey"
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
        <Button
          variant="secondary"
          type="button"
          onClick={() => setCreating(true)}
          className="mt-2.5 justify-self-start sm:col-start-2 sm:row-start-1 sm:mt-0 sm:self-end"
        >
          {t.booking.newCustomer}
        </Button>
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
