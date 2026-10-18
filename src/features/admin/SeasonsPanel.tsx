import { Fragment, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  ActionsMenu,
  Banner,
  Button,
  Card,
  Field,
  Input,
  Spinner,
} from '@/components';
import type { AdminSeason } from '@/features/reference/api';
import { errorText, formatDay } from './payroll/payrollFormat';
import {
  useAddSeason,
  useAdminSeasons,
  useDeleteSeason,
  useUpdateSeason,
} from './api';

const SEASON_KEY_RE = /^\d{4}\/\d{2}$/;

function defaultRange(key: string) {
  const year = Number(key.slice(0, 4));
  return { startsOn: `${year}-11-01`, endsOn: `${year + 1}-04-30` };
}

function useSeasonError() {
  const t = useT();
  return (err: unknown) =>
    err instanceof ApiError && err.status === 409
      ? t.seasons.conflict
      : errorText(err, t.errors.generic);
}

export function SeasonsPanel() {
  const t = useT();
  const { locale } = useLocale();
  const seasons = useAdminSeasons();
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminSeason | null>(null);
  const th = 'whitespace-nowrap px-4 py-2 font-medium';

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-slate">{t.seasons.intro}</p>
      <Card className="flex flex-col gap-4 p-0">
        {seasons.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : seasons.isError ? (
          <div className="p-4">
            <Banner tone="error">{t.errors.generic}</Banner>
          </div>
        ) : (seasons.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate">{t.seasons.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              aria-label={t.seasons.tab}
              className="w-full min-w-[32rem] text-sm"
            >
              <thead>
                <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                  <th className={th}>{t.seasons.colKey}</th>
                  <th className={th}>{t.seasons.startsLabel}</th>
                  <th className={th}>{t.seasons.endsLabel}</th>
                  <th className={cn(th, 'w-px')}>{t.admin.colStatus}</th>
                  <th className={cn(th, 'w-px text-right')}>
                    {t.admin.actions}
                  </th>
                </tr>
              </thead>
              <tbody data-public>
                {(seasons.data ?? []).map((s, i) => (
                  <Fragment key={s.key}>
                    <tr
                      aria-current={editing === s.key || undefined}
                      className={cn(
                        editing === s.key
                          ? 'bg-navy-tint shadow-[inset_3px_0_0_var(--navy)]'
                          : i % 2 === 1 && 'bg-sunken',
                      )}
                    >
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-ink">
                        {s.key}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {formatDay(s.startsOn, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {formatDay(s.endsOn, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className="flex flex-col items-start gap-1">
                          {s.isCurrent && (
                            <span className="inline-flex items-center rounded-sm border-l-[3px] border-status-approved bg-sunken px-2 py-0.5 text-xs font-medium text-ink">
                              {t.seasons.current}
                            </span>
                          )}
                          {s.inUse && (
                            <span className="inline-flex items-center rounded-sm border-l-[3px] border-grey bg-sunken px-2 py-0.5 text-xs text-slate">
                              {t.seasons.inUseTag}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <div className="flex justify-end">
                          <ActionsMenu
                            label={t.common.moreActionsFor.replace(
                              '{name}',
                              s.key,
                            )}
                            items={[
                              {
                                key: 'edit',
                                label: t.common.edit,
                                ariaLabel: t.seasons.editFor.replace(
                                  '{key}',
                                  s.key,
                                ),
                                onSelect: () => setEditing(s.key),
                              },
                              {
                                key: 'remove',
                                label: t.admin.removeRow,
                                ariaLabel: t.seasons.removeFor.replace(
                                  '{key}',
                                  s.key,
                                ),
                                destructive: true,
                                disabled: s.inUse,
                                description: s.inUse
                                  ? t.seasons.inUse
                                  : undefined,
                                onSelect: () => setRemoving(s),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                    {editing === s.key && (
                      <EditSeasonRow
                        season={s}
                        onDone={() => setEditing(null)}
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {removing && (
          <ConfirmRemoveSeason
            season={removing}
            onClose={() => setRemoving(null)}
          />
        )}
      </Card>
      <AddSeason />
    </div>
  );
}

function ConfirmRemoveSeason({
  season,
  onClose,
}: {
  season: AdminSeason;
  onClose: () => void;
}) {
  const t = useT();
  const remove = useDeleteSeason();
  const inUse = remove.error instanceof ApiError && remove.error.status === 409;
  return (
    <div
      role="alertdialog"
      aria-labelledby="confirm-remove-season-title"
      className="mx-4 mb-4 flex flex-col gap-3 rounded-md border-l-[3px] border-l-status-rejected bg-red-tint px-4 py-3 text-sm text-ink"
    >
      <p id="confirm-remove-season-title" className="font-semibold">
        {t.seasons.removeTitle.replace('{key}', season.key)}
      </p>
      <p>{t.seasons.removeBody}</p>
      {remove.isError && (
        <Banner tone="error">
          {inUse ? t.seasons.inUse : errorText(remove.error, t.errors.generic)}
        </Banner>
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
          loading={remove.isPending}
          disabled={inUse}
          onClick={() => remove.mutate(season.key, { onSuccess: onClose })}
        >
          {t.seasons.removeConfirm}
        </Button>
      </div>
    </div>
  );
}

function EditSeasonRow({
  season,
  onDone,
}: {
  season: AdminSeason;
  onDone: () => void;
}) {
  const t = useT();
  const seasonError = useSeasonError();
  const update = useUpdateSeason();
  const [startsOn, setStartsOn] = useState(season.startsOn);
  const [endsOn, setEndsOn] = useState(season.endsOn);
  const orderInvalid = Boolean(startsOn && endsOn && endsOn <= startsOn);
  const changes = {
    ...(startsOn !== season.startsOn && { startsOn }),
    ...(endsOn !== season.endsOn && { endsOn }),
  };
  const dirty = Object.keys(changes).length > 0;
  const valid = Boolean(startsOn && endsOn) && !orderInvalid;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !valid || update.isPending) return;
    update.mutate({ key: season.key, ...changes }, { onSuccess: onDone });
  }

  return (
    <tr className="bg-navy-tint shadow-[inset_3px_0_0_var(--navy)]">
      <td colSpan={5} className="px-4 pb-4 pt-1">
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-md border border-grey/60 bg-surface p-4 shadow-card sm:p-5"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-lg">
              {t.seasons.editTitle.replace('{key}', season.key)}
            </h2>
            <p className="text-sm text-slate">{t.seasons.keyLocked}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.seasons.startsLabel} required>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              )}
            </Field>
            <Field
              label={t.seasons.endsLabel}
              required
              error={orderInvalid ? t.seasons.endsBeforeStart : undefined}
            >
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              )}
            </Field>
          </div>
          {update.isError && (
            <Banner tone="error">{seasonError(update.error)}</Banner>
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
              disabled={!dirty || !valid}
            >
              {t.common.save}
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function AddSeason() {
  const t = useT();
  const seasonError = useSeasonError();
  const add = useAddSeason();
  const [key, setKey] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [datesTouched, setDatesTouched] = useState(false);
  const keyValid = SEASON_KEY_RE.test(key.trim());
  const orderInvalid = Boolean(startsOn && endsOn && endsOn <= startsOn);
  const ready = keyValid && Boolean(startsOn && endsOn) && !orderInvalid;

  function changeKey(value: string) {
    setKey(value);
    if (!datesTouched && SEASON_KEY_RE.test(value.trim())) {
      const range = defaultRange(value.trim());
      setStartsOn(range.startsOn);
      setEndsOn(range.endsOn);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || add.isPending) return;
    try {
      await add.mutateAsync({ key: key.trim(), startsOn, endsOn });
      setKey('');
      setStartsOn('');
      setEndsOn('');
      setDatesTouched(false);
    } catch {
      return;
    }
  }

  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <h2 className="text-lg">{t.seasons.addTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={t.seasons.colKey}
            required
            hint={t.seasons.keyHint}
            error={key.trim() && !keyValid ? t.seasons.keyInvalid : undefined}
          >
            {(p) => (
              <Input
                {...p}
                value={key}
                placeholder="2027/28"
                onChange={(e) => changeKey(e.target.value)}
              />
            )}
          </Field>
          <Field label={t.seasons.startsLabel} required>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={startsOn}
                onChange={(e) => {
                  setDatesTouched(true);
                  setStartsOn(e.target.value);
                }}
              />
            )}
          </Field>
          <Field
            label={t.seasons.endsLabel}
            required
            error={orderInvalid ? t.seasons.endsBeforeStart : undefined}
          >
            {(p) => (
              <Input
                {...p}
                type="date"
                value={endsOn}
                onChange={(e) => {
                  setDatesTouched(true);
                  setEndsOn(e.target.value);
                }}
              />
            )}
          </Field>
        </div>
        {add.isSuccess && <Banner tone="approved">{t.seasons.added}</Banner>}
        {add.isError && <Banner tone="error">{seasonError(add.error)}</Banner>}
        <div className="flex justify-end">
          <Button type="submit" loading={add.isPending} disabled={!ready}>
            {t.common.add}
          </Button>
        </div>
      </form>
    </Card>
  );
}
