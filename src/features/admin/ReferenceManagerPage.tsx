import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
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
  MachineTranslationNote,
  TranslatedByBadge,
} from '@/features/translation/TranslatedByBadge';
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

/** W2.13 — admin reference-data manager: tabs, row status/actions, add/edit-row form. */
export function ReferenceManagerPage() {
  const t = useT();
  const [slug, setSlug] = useState<ReferenceSlug>('teaching-locations');
  const [editing, setEditing] = useState<ReferenceRecord | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{t.admin.referenceTitle}</h1>

      <div className="flex flex-wrap gap-1 border-b border-grey/60">
        {TABS.map((tab) => (
          <button
            key={tab.slug}
            onClick={() => {
              setSlug(tab.slug);
              setEditing(null);
            }}
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

      <div className="flex flex-col gap-6">
        <ReferenceTable
          key={slug}
          slug={slug}
          editing={editing}
          onEdit={setEditing}
          onDoneEditing={() => setEditing(null)}
          onRemoved={(id) =>
            setEditing((current) => (current?.id === id ? null : current))
          }
        />
        <AddRow slug={slug} />
      </div>
    </div>
  );
}

function ReferenceTable({
  slug,
  editing,
  onEdit,
  onDoneEditing,
  onRemoved,
}: {
  slug: ReferenceSlug;
  editing: ReferenceRecord | null;
  onEdit: (row: ReferenceRecord) => void;
  onDoneEditing: () => void;
  onRemoved: (id: string) => void;
}) {
  const t = useT();
  const rows = useAdminReferences(slug);
  const [removing, setRemoving] = useState<ReferenceRecord | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<string | null>(null);

  useEffect(() => {
    if (editing || !returnFocusTo.current) return;
    const id = returnFocusTo.current;
    returnFocusTo.current = null;
    const target =
      document.getElementById(editTriggerId(id)) ??
      tableRef.current?.querySelector<HTMLElement>('[data-edit-trigger]') ??
      tableRef.current;
    target?.focus();
  }, [editing]);

  function doneEditing() {
    if (editing) returnFocusTo.current = editing.id;
    onDoneEditing();
  }

  return (
    <Card className="flex flex-col gap-4 p-0">
      {rows.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div ref={tableRef} tabIndex={-1} className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                <th className="hidden whitespace-nowrap px-4 py-2 font-medium xl:table-cell">
                  {t.admin.keyLabel}
                </th>
                <th className="min-w-[12rem] px-4 py-2 font-medium">
                  {t.admin.nameLabel}
                </th>
                <th className="min-w-[9rem] whitespace-nowrap px-4 py-2 font-medium">
                  {t.translation.nameZhLabel}
                </th>
                <th className="w-px whitespace-nowrap px-4 py-2 font-medium">
                  {t.admin.colStatus}
                </th>
                <th className="w-px whitespace-nowrap px-4 py-2 text-right font-medium">
                  {t.admin.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {(rows.data ?? []).map((r, i) => {
                const selected = r.id === editing?.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      aria-current={selected || undefined}
                      className={cn(
                        selected
                          ? 'bg-navy-tint shadow-[inset_3px_0_0_var(--navy)]'
                          : i % 2 === 1 && 'bg-sunken',
                        !r.isActive && 'text-slate',
                      )}
                    >
                      <td
                        className={cn(
                          'hidden whitespace-nowrap px-4 py-2 font-mono text-xs text-slate xl:table-cell',
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
                        <div className="flex flex-col gap-1">
                          <span>{r.name}</span>
                          <span className="whitespace-nowrap font-mono text-xs text-slate xl:hidden">
                            {r.key}
                          </span>
                          <TranslatedByBadge
                            model={r.nameEnTranslatedBy}
                            onTint={selected}
                          />
                        </div>
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2',
                          r.isActive ? 'text-ink' : 'opacity-60',
                        )}
                      >
                        <div className="flex flex-col gap-1">
                          <span>{r.nameZh || '—'}</span>
                          <TranslatedByBadge
                            model={r.nameZhTranslatedBy}
                            onTint={selected}
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <RefStatus isActive={r.isActive} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            id={editTriggerId(r.id)}
                            data-edit-trigger
                            size="sm"
                            variant="secondary"
                            aria-expanded={selected}
                            aria-controls={editPanelId(r.id)}
                            aria-label={t.admin.editRowFor.replace(
                              '{name}',
                              r.name,
                            )}
                            onClick={() => onEdit(r)}
                          >
                            {t.common.edit}
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
                    {selected && (
                      <EditRow
                        key={editing.id}
                        slug={slug}
                        row={editing}
                        onDone={doneEditing}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {removing && (
        <ConfirmRemove
          slug={slug}
          row={removing}
          onRemoved={() => onRemoved(removing.id)}
          onClose={() => setRemoving(null)}
        />
      )}
    </Card>
  );
}

function editPanelId(id: string) {
  return `ref-edit-${id}`;
}

function editTriggerId(id: string) {
  return `ref-edit-trigger-${id}`;
}

function isEnglishNameRequired(err: unknown) {
  return err instanceof ApiError && err.status === 422;
}

function RefStatus({ isActive }: { isActive: boolean }) {
  const t = useT();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border-l-[3px] bg-sunken px-2 py-0.5 text-xs font-medium',
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
  onRemoved,
  onClose,
}: {
  slug: ReferenceSlug;
  row: ReferenceRecord;
  onRemoved: () => void;
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
          onClick={() =>
            remove.mutate(row.id, {
              onSuccess: () => {
                onRemoved();
                onClose();
              },
            })
          }
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
  const [nameZh, setNameZh] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [keyError, setKeyError] = useState<string | null>(null);

  async function submit() {
    setKeyError(null);
    setNameError(null);
    try {
      await add.mutateAsync({
        key: key.trim(),
        ...(name.trim() && { name: name.trim() }),
        ...(nameZh.trim() && { nameZh: nameZh.trim() }),
        sortOrder: Number(sortOrder) || 0,
        isActive,
      });
      setKey('');
      setName('');
      setNameZh('');
      setSortOrder('0');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setKeyError(t.admin.duplicateKey);
      } else if (isEnglishNameRequired(err)) {
        setNameError(t.translation.englishNameRequired);
      }
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg">{t.admin.addRow}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.admin.keyLabel} required error={keyError ?? undefined}>
          {(p) => (
            <Input
              {...p}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          )}
        </Field>
        <Field label={t.admin.nameLabel} error={nameError ?? undefined}>
          {(p) => (
            <Input
              {...p}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t.translation.nameZhLabel}
          hint={t.translation.addNameHint}
        >
          {(p) => (
            <Input
              {...p}
              value={nameZh}
              onChange={(e) => setNameZh(e.target.value)}
            />
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
      </div>
      {add.isSuccess && <Banner tone="approved">{t.admin.addedRow}</Banner>}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Toggle
            checked={isActive}
            onChange={setIsActive}
            label={t.admin.activeLabel}
          />
          <span className="text-sm text-slate">{t.admin.activeLabel}</span>
        </div>
        <Button
          onClick={submit}
          loading={add.isPending}
          disabled={!key.trim() || (!name.trim() && !nameZh.trim())}
        >
          {t.common.add}
        </Button>
      </div>
    </Card>
  );
}

function EditRow({
  slug,
  row,
  onDone,
}: {
  slug: ReferenceSlug;
  row: ReferenceRecord;
  onDone: () => void;
}) {
  const t = useT();
  const update = useUpdateReference(slug);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const nameZhRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(row.name);
  const [nameZh, setNameZh] = useState(row.nameZh ?? '');
  const [sortOrder, setSortOrder] = useState(String(row.sortOrder));
  const [isActive, setIsActive] = useState(row.isActive);

  useEffect(() => {
    nameZhRef.current?.focus({ preventScroll: true });
    rowRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const nameChanged = name.trim() !== row.name;
  const nextNameZh = nameZh.trim() || null;
  const nameZhChanged = nextNameZh !== (row.nameZh || null);
  const nextSortOrder = Number(sortOrder) || 0;
  const changes = {
    ...(nameChanged && { name: name.trim() }),
    ...(nameZhChanged && { nameZh: nextNameZh }),
    ...(nextSortOrder !== row.sortOrder && { sortOrder: nextSortOrder }),
    ...(isActive !== row.isActive && { isActive }),
  };
  const dirty = Object.keys(changes).length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !name.trim() || update.isPending) return;
    update.mutate({ id: row.id, ...changes }, { onSuccess: onDone });
  }

  return (
    <tr
      ref={rowRef}
      id={editPanelId(row.id)}
      className="scroll-my-6 bg-navy-tint shadow-[inset_3px_0_0_var(--navy)]"
    >
      <td
        colSpan={5}
        className="px-4 pb-4 pt-1"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !update.isPending) onDone();
        }}
      >
        <div className="flex flex-col gap-4 rounded-md border border-grey/60 bg-surface p-4 shadow-card sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg">{t.admin.editRow}</h2>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-slate">
              <span>{t.admin.editingName.replace('{name}', row.name)}</span>
              <span className="break-all font-mono text-xs">
                {t.admin.keyLabel}: {row.key}
              </span>
            </p>
          </div>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Field label={t.admin.nameLabel}>
                  {(p) => (
                    <Input
                      {...p}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  )}
                </Field>
                {!nameChanged && (
                  <MachineTranslationNote model={row.nameEnTranslatedBy} />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Field label={t.translation.nameZhLabel}>
                  {(p) => (
                    <Input
                      {...p}
                      ref={nameZhRef}
                      value={nameZh}
                      onChange={(e) => setNameZh(e.target.value)}
                    />
                  )}
                </Field>
                {!nameZhChanged && (
                  <MachineTranslationNote model={row.nameZhTranslatedBy} />
                )}
              </div>
              <Field label={t.admin.sortOrder}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                  />
                )}
              </Field>
              <div className="flex items-center gap-2 sm:mt-7">
                <Toggle
                  checked={isActive}
                  onChange={setIsActive}
                  label={t.admin.activeLabel}
                />
                <span className="text-sm text-slate">
                  {t.admin.activeLabel}
                </span>
              </div>
            </div>
            {update.isError && (
              <Banner tone="error">
                {isEnglishNameRequired(update.error)
                  ? t.translation.englishNameRequired
                  : t.errors.generic}
              </Banner>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onDone}
                disabled={update.isPending}
              >
                {t.common.cancel}
              </Button>
              <Button
                type="submit"
                loading={update.isPending}
                disabled={!dirty || !name.trim()}
              >
                {t.common.save}
              </Button>
            </div>
          </form>
        </div>
      </td>
    </tr>
  );
}
