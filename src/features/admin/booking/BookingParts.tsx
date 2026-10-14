import { useEffect, useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { api } from '@/lib/api';
import { Banner, Button, Field, Input, Spinner } from '@/components';
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

const TYPEAHEAD_DELAY_MS = 250;
const TYPEAHEAD_MIN = 2;

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
        <div className="flex items-start justify-between gap-4">
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
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useDebounced(draft.trim(), TYPEAHEAD_DELAY_MS);
  const results = useCustomerTypeahead(q);
  const chosen = new Set(selected.map((c) => c.id));
  const options = (results.data ?? []).filter((c) => !chosen.has(c.id));

  function add(customer: PickedCustomer) {
    onChange([...selected, customer]);
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <ul
          aria-label={t.booking.selectedCustomers}
          className="flex flex-wrap gap-2"
        >
          {selected.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-1 rounded-md bg-navy-tint py-1 pl-3 pr-1 text-sm text-navy"
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label={t.booking.customerSearch}
            hint={t.booking.customerSearchHint}
          >
            {(p) => (
              <Input
                {...p}
                type="search"
                autoComplete="off"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Button
          variant="secondary"
          type="button"
          onClick={() => setCreating(true)}
        >
          {t.booking.newCustomer}
        </Button>
      </div>
      {q.length >= TYPEAHEAD_MIN &&
        draft.trim().length >= TYPEAHEAD_MIN &&
        (results.isLoading ? (
          <Spinner />
        ) : results.isError ? (
          <Banner tone="error">{t.errors.generic}</Banner>
        ) : options.length === 0 ? (
          <p className="text-sm text-slate">{t.booking.noCustomerMatch}</p>
        ) : (
          <ul
            aria-label={t.booking.customerResults}
            className="divide-y divide-grey/40 rounded-md border border-grey/60"
          >
            {options.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap gap-x-2 px-3 py-2 text-left text-sm hover:bg-navy-tint"
                  onClick={() => add(c)}
                >
                  <span className="font-medium text-ink">{pickedName(c)}</span>
                  {c.email && <span className="text-slate">{c.email}</span>}
                  {c.phone && (
                    <span className="font-mono text-xs text-slate">
                      {c.phone}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ))}
      {creating && (
        <Dialog
          title={t.booking.newCustomer}
          onClose={() => setCreating(false)}
        >
          <CreateCustomerCard
            onCreated={(customer) => {
              add(customer);
              setCreating(false);
            }}
          />
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
