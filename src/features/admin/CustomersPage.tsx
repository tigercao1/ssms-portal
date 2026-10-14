import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Spinner,
} from '@/components';
import type { Messages } from '@/i18n/core/types';
import type { Customer, CustomerCreate } from '@/lib/types';
import {
  CUSTOMERS_PAGE_SIZE,
  useCreateCustomer,
  useCustomerPage,
  useCustomerSyncStatus,
  useSyncCustomers,
} from './customersApi';
import { customerName } from './lessonRules';
import { errorText } from './LessonTypesPage';

const SEARCH_DEBOUNCE_MS = 200;

function pageFrom(params: URLSearchParams): number {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page > 1 ? page : 1;
}

export function CustomersPage() {
  const t = useT();
  const { locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = pageFrom(params);
  const [draft, setDraft] = useState(q);
  const committed = useRef(q);
  const results = useCustomerPage(q, page);
  const customers = results.data?.customers ?? [];
  const total = results.data?.total ?? 0;
  const shownPage = results.data?.page ?? page;
  const number = new Intl.NumberFormat(locale);

  const update = useCallback(
    (next: { q?: string; page?: number }) => {
      if (next.q !== undefined) committed.current = next.q;
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next.q !== undefined) {
            if (next.q) out.set('q', next.q);
            else out.delete('q');
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

  const from = (shownPage - 1) * CUSTOMERS_PAGE_SIZE + 1;
  const to = from + customers.length - 1;
  const hasNext = shownPage * CUSTOMERS_PAGE_SIZE < total;
  const lastPage = Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE));
  const busy = results.isPlaceholderData;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">{t.customers.title}</h1>
        <p className="max-w-3xl text-slate">{t.customers.intro}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <form
              role="search"
              onSubmit={submit}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <Field label={t.customers.searchLabel}>
                  {(p) => (
                    <Input
                      {...p}
                      type="search"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <Button type="submit" variant="secondary">
                {t.customers.search}
              </Button>
            </form>
          </Card>

          {results.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : results.isError ? (
            <Banner tone="error">
              {errorText(results.error, t.errors.generic)}
            </Banner>
          ) : customers.length === 0 && page === 1 ? (
            <EmptyState title={t.customers.empty}>
              {q ? null : t.customers.emptyHint}
            </EmptyState>
          ) : (
            <Card className="p-0">
              <div
                className={cn(
                  'overflow-x-auto transition-opacity',
                  busy && 'opacity-60',
                )}
                aria-busy={busy}
              >
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                      <th className="px-4 py-2 font-medium">
                        {t.customers.colName}
                      </th>
                      <th className="px-4 py-2 font-medium">
                        {t.customers.colEmail}
                      </th>
                      <th className="whitespace-nowrap px-4 py-2 font-medium">
                        {t.customers.colPhone}
                      </th>
                      <th className="hidden whitespace-nowrap px-4 py-2 font-medium lg:table-cell">
                        {t.customers.colShopify}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c, i) => (
                      <tr key={c.id} className={cn(i % 2 === 1 && 'bg-sunken')}>
                        <td className="px-4 py-2 text-ink">
                          {customerName(c) || '—'}
                        </td>
                        <td className="break-all px-4 py-2">
                          {c.email ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                          {c.phone ?? '—'}
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-2 font-mono text-xs text-slate lg:table-cell">
                          {c.shopifyCustomerId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {customers.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-slate">
                    {t.customers.empty}
                  </p>
                )}
              </div>
              <nav
                aria-label={t.customers.pagination}
                className="flex flex-col gap-2 border-t border-grey/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-slate" aria-live="polite">
                  {customers.length > 0
                    ? t.customers.showing
                        .replace('{from}', number.format(from))
                        .replace('{to}', number.format(to))
                        .replace('{total}', number.format(total))
                    : null}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 1 || busy}
                    onClick={() =>
                      update({ page: Math.min(page - 1, lastPage) })
                    }
                  >
                    {t.customers.prevPage}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!hasNext || busy}
                    onClick={() => update({ page: page + 1 })}
                  >
                    {t.customers.nextPage}
                  </Button>
                </div>
              </nav>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <SyncCard />
          <CreateCustomerCard />
        </div>
      </div>
    </div>
  );
}

function SyncCard() {
  const t = useT();
  const sync = useSyncCustomers();
  const result = sync.data;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg">{t.customers.syncTitle}</h2>
      <p className="text-sm text-slate">{t.customers.syncBody}</p>
      <Button
        variant="secondary"
        loading={sync.isPending}
        onClick={() => sync.mutate()}
      >
        {t.customers.sync}
      </Button>
      <AutoSyncStatus />
      {sync.isError && (
        <Banner tone="error" title={t.customers.syncFailed}>
          {errorText(sync.error, t.errors.generic)}
        </Banner>
      )}
      {sync.isSuccess && result && (
        <Banner
          tone="approved"
          title={
            result.mode === 'backfill'
              ? t.customers.syncModeBackfill
              : t.customers.syncModeIncremental
          }
        >
          <p>
            {t.customers.syncFetched
              .replace('{count}', String(result.fetched))
              .replace('{pages}', String(result.pages))}
          </p>
          {result.hasMore && <p>{t.customers.syncMore}</p>}
        </Banner>
      )}
    </Card>
  );
}

const MINUTE_MS = 60_000;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function timeAgo(iso: string, now: number, t: Messages): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / MINUTE_MS));
  if (minutes < 1) return t.customers.justNow;
  if (minutes < 60)
    return t.customers.minutesAgo.replace('{count}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.customers.hoursAgo.replace('{count}', String(hours));
  return t.customers.daysAgo.replace('{count}', String(Math.floor(hours / 24)));
}

function AutoSyncStatus() {
  const t = useT();
  const status = useCustomerSyncStatus();
  const now = useNow(MINUTE_MS);
  if (!status.data) return null;
  const { scheduled, intervalMinutes, lastSuccessAt, lastError } = status.data;
  const last = lastSuccessAt
    ? t.customers.lastSynced.replace('{ago}', timeAgo(lastSuccessAt, now, t))
    : t.customers.notSyncedYet;
  const schedule = scheduled
    ? t.customers.autoEvery.replace('{minutes}', String(intervalMinutes))
    : t.customers.autoOff;
  return (
    <div className="flex flex-col gap-1 text-sm text-slate">
      <p>
        {last} · {schedule}
      </p>
      {lastError && (
        <p className="text-red">
          {t.customers.lastAutoFailed.replace('{error}', lastError)}
        </p>
      )}
    </div>
  );
}

const EMPTY_CUSTOMER = { firstName: '', lastName: '', email: '', phone: '' };

function duplicateField(err: unknown): 'email' | 'phone' | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  return /phone/i.test(err.message) ? 'phone' : 'email';
}

export function CreateCustomerCard({
  onCreated,
}: {
  onCreated?: (customer: Customer) => void;
}) {
  const t = useT();
  const create = useCreateCustomer();
  const [values, setValues] = useState(EMPTY_CUSTOMER);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const duplicate = duplicateField(create.error);
  const set = (key: keyof typeof EMPTY_CUSTOMER, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setCreatedName(null);
    create.reset();
  };
  const ready = Boolean(values.firstName.trim() && values.lastName.trim());

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || create.isPending) return;
    const body: CustomerCreate = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      ...(values.email.trim() && { email: values.email.trim() }),
      ...(values.phone.trim() && { phone: values.phone.trim() }),
    };
    create.mutate(body, {
      onSuccess: (customer) => {
        setCreatedName(customerName(customer));
        setValues(EMPTY_CUSTOMER);
        onCreated?.(customer);
      },
    });
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <h2 className="text-lg">{t.customers.createTitle}</h2>
        <p className="text-sm text-slate">{t.customers.createBody}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <Field label={t.customers.firstNameLabel} required>
            {(p) => (
              <Input
                {...p}
                autoComplete="off"
                value={values.firstName}
                onChange={(e) => set('firstName', e.target.value)}
              />
            )}
          </Field>
          <Field label={t.customers.lastNameLabel} required>
            {(p) => (
              <Input
                {...p}
                autoComplete="off"
                value={values.lastName}
                onChange={(e) => set('lastName', e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t.customers.emailLabel}
            error={duplicate === 'email' ? t.customers.emailTaken : undefined}
          >
            {(p) => (
              <Input
                {...p}
                type="email"
                autoComplete="off"
                value={values.email}
                onChange={(e) => set('email', e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t.customers.phoneLabel}
            hint={t.customers.phoneHint}
            error={duplicate === 'phone' ? t.customers.phoneTaken : undefined}
          >
            {(p) => (
              <Input
                {...p}
                type="tel"
                autoComplete="off"
                value={values.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            )}
          </Field>
        </div>
        {create.isError && (
          <Banner tone="error" title={t.customers.createFailed}>
            {duplicate === 'email'
              ? t.customers.emailTaken
              : duplicate === 'phone'
                ? t.customers.phoneTaken
                : errorText(create.error, t.errors.generic)}
          </Banner>
        )}
        {createdName !== null && (
          <Banner tone="approved">
            {t.customers.created.replace('{name}', createdName)}
          </Banner>
        )}
        <Button type="submit" loading={create.isPending} disabled={!ready}>
          {t.customers.create}
        </Button>
      </form>
    </Card>
  );
}
