import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
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
import type { CustomerCreate } from '@/lib/types';
import {
  useCreateCustomer,
  useCustomerSearch,
  useSyncCustomers,
} from './customersApi';
import { customerName } from './lessonRules';
import { errorText } from './LessonTypesPage';

export function CustomersPage() {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const results = useCustomerSearch(q);

  function submit(e: FormEvent) {
    e.preventDefault();
    setQ(draft.trim());
  }

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
          ) : (results.data ?? []).length === 0 ? (
            <EmptyState title={t.customers.empty}>
              {q ? null : t.customers.emptyHint}
            </EmptyState>
          ) : (
            <Card className="p-0">
              <div className="overflow-x-auto">
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
                    {(results.data ?? []).map((c, i) => (
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
              </div>
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

const EMPTY_CUSTOMER = { firstName: '', lastName: '', email: '', phone: '' };

function duplicateField(err: unknown): 'email' | 'phone' | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  return /phone/i.test(err.message) ? 'phone' : 'email';
}

function CreateCustomerCard() {
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
