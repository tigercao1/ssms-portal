import { useState } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Spinner,
  Toggle,
} from '@/components';
import type { ReferenceSlug } from '@/features/reference/api';
import {
  useAddReference,
  useAdminReferences,
  useDeleteReference,
  useReferenceUsage,
  useUpdateReference,
} from './api';
import type { ReferenceRecord } from '@/lib/types';

const TABS: { slug: ReferenceSlug; labelKey: keyof ReturnType<typeof useT>['reference'] }[] =
  [
    { slug: 'teaching-locations', labelKey: 'teachingLocations' },
    { slug: 'languages', labelKey: 'languages' },
    { slug: 'course-levels-offered', labelKey: 'courseLevels' },
    { slug: 'exam-preparations', labelKey: 'examPreps' },
  ];

/** W2.13 — admin reference-data manager: tabs, row status/actions, add-row form. */
export function ReferenceManagerPage() {
  const t = useT();
  const [slug, setSlug] = useState<ReferenceSlug>('teaching-locations');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{t.admin.referenceTitle}</h1>

      <div className="flex flex-wrap gap-1 border-b border-grey/60">
        {TABS.map((tab) => (
          <button
            key={tab.slug}
            onClick={() => setSlug(tab.slug)}
            className={
              'border-b-2 px-3 py-2 text-sm transition-colors ' +
              (slug === tab.slug
                ? 'border-red font-medium text-navy'
                : 'border-transparent text-slate hover:text-navy')
            }
          >
            {t.reference[tab.labelKey]}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ReferenceTable key={slug} slug={slug} />
        <AddRow slug={slug} />
      </div>
    </div>
  );
}

function ReferenceTable({ slug }: { slug: ReferenceSlug }) {
  const t = useT();
  const rows = useAdminReferences(slug);
  const update = useUpdateReference(slug);
  const [removing, setRemoving] = useState<ReferenceRecord | null>(null);

  return (
    <Card className="flex flex-col gap-4 p-0">
      {rows.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
              <th className="px-4 py-2 font-medium">{t.admin.keyLabel}</th>
              <th className="px-4 py-2 font-medium">{t.admin.nameLabel}</th>
              <th className="px-4 py-2 font-medium">{t.admin.colStatus}</th>
              <th className="px-4 py-2 text-right font-medium">
                {t.admin.actions}
              </th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((r, i) => (
              <tr
                key={r.id}
                className={cn(
                  i % 2 === 1 && 'bg-sunken',
                  !r.isActive && 'text-slate',
                )}
              >
                <td
                  className={cn(
                    'px-4 py-2 font-mono text-xs text-slate',
                    !r.isActive && 'opacity-60',
                  )}
                >
                  {r.key}
                </td>
                <td
                  className={cn(
                    'px-4 py-2',
                    r.isActive ? 'text-ink' : 'opacity-60',
                  )}
                >
                  {r.name}
                </td>
                <td className="px-4 py-2">
                  <RefStatus isActive={r.isActive} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={
                        update.isPending && update.variables?.id === r.id
                      }
                      onClick={() =>
                        update.mutate({ id: r.id, isActive: !r.isActive })
                      }
                    >
                      {r.isActive ? t.admin.deactivate : t.admin.activate}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRemoving(r)}
                    >
                      {t.admin.removeRow}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {update.isError && (
        <div className="px-4 pb-4">
          <Banner tone="error">{t.errors.generic}</Banner>
        </div>
      )}
      {removing && (
        <ConfirmRemove
          slug={slug}
          row={removing}
          onClose={() => setRemoving(null)}
        />
      )}
    </Card>
  );
}

function RefStatus({ isActive }: { isActive: boolean }) {
  const t = useT();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border-l-[3px] bg-sunken px-2 py-0.5 text-xs font-medium',
        isActive ? 'border-status-approved text-ink' : 'border-grey text-slate',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          isActive ? 'bg-status-approved' : 'bg-grey',
        )}
        aria-hidden
      />
      {isActive ? t.admin.refActive : t.admin.refInactive}
    </span>
  );
}

function ConfirmRemove({
  slug,
  row,
  onClose,
}: {
  slug: ReferenceSlug;
  row: ReferenceRecord;
  onClose: () => void;
}) {
  const t = useT();
  const usage = useReferenceUsage(slug, row.id);
  const remove = useDeleteReference(slug);
  const count = usage.data?.instructorCount ?? 0;
  const usageFresh = usage.isSuccess && !usage.isFetching;

  return (
    <div
      role="alertdialog"
      aria-labelledby="confirm-remove-title"
      className="mx-4 mb-4 flex flex-col gap-3 rounded-md border-l-[3px] border-l-status-rejected bg-red-tint px-4 py-3 text-sm text-ink"
    >
      <p id="confirm-remove-title" className="font-semibold">
        {t.admin.removeTitle.replace('{name}', row.name)}
      </p>
      {usage.isFetching ? (
        <Spinner />
      ) : (
        <>
          <p>{t.admin.removePermanent}</p>
          {count > 0 && (
            <p>{t.admin.removeUsage.replace('{count}', String(count))}</p>
          )}
        </>
      )}
      {(usage.isError || remove.isError) && (
        <Banner tone="error">{t.errors.generic}</Banner>
      )}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={remove.isPending}
        >
          {t.common.cancel}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => remove.mutate(row.id, { onSuccess: onClose })}
          loading={remove.isPending}
          disabled={!usageFresh}
        >
          {t.admin.removeConfirm}
        </Button>
      </div>
    </div>
  );
}

function AddRow({ slug }: { slug: ReferenceSlug }) {
  const t = useT();
  const add = useAddReference(slug);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [keyError, setKeyError] = useState<string | null>(null);

  async function submit() {
    setKeyError(null);
    try {
      await add.mutateAsync({
        key: key.trim(),
        name: name.trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive,
      });
      setKey('');
      setName('');
      setSortOrder('0');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setKeyError(t.admin.duplicateKey);
      }
    }
  }

  return (
    <Card className="flex h-fit flex-col gap-4">
      <h2 className="text-lg">{t.admin.addRow}</h2>
      <Field label={t.admin.keyLabel} required error={keyError ?? undefined}>
        {(p) => (
          <Input {...p} value={key} onChange={(e) => setKey(e.target.value)} />
        )}
      </Field>
      <Field label={t.admin.nameLabel} required>
        {(p) => (
          <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label={t.admin.sortOrder}>
        {(p) => (
          <Input
            {...p}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        )}
      </Field>
      <div className="flex items-center gap-2">
        <Toggle checked={isActive} onChange={setIsActive} label={t.admin.activeLabel} />
        <span className="text-sm text-slate">{t.admin.activeLabel}</span>
      </div>
      {add.isSuccess && <Banner tone="approved">{t.admin.addedRow}</Banner>}
      <Button
        onClick={submit}
        loading={add.isPending}
        disabled={!key.trim() || !name.trim()}
      >
        {t.common.add}
      </Button>
    </Card>
  );
}
