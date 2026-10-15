import { useMemo, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import {
  Banner,
  Button,
  Field,
  Input,
  Modal,
  Spinner,
  StatusPill,
} from '@/components';
import { useAdminInstructors } from '@/features/admin/api';
import type { AssignResult, TemplateSummary } from '../api';
import { useCreateAssignments } from './hooks';
import { errorText, templateTitle } from './format';

export const SEASON_RE = /^\d{4}\/\d{2}$/;

/** Ski season label for a date, e.g. `2026/27` from August 2026 through July 2027. */
export function seasonFor(now: Date = new Date()): string {
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Assigns a template to picked instructors or every active one, for a season. */
export function AssignDialog({
  template,
  onClose,
  initialInstructorIds = [],
}: {
  template: TemplateSummary;
  onClose: () => void;
  initialInstructorIds?: string[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const instructors = useAdminInstructors({});
  const assign = useCreateAssignments();
  const [season, setSeason] = useState(seasonFor);
  const [mode, setMode] = useState<'all' | 'pick'>(
    initialInstructorIds.length ? 'pick' : 'all',
  );
  const [picked, setPicked] = useState(() => new Set(initialInstructorIds));
  const [query, setQuery] = useState('');
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<AssignResult | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (instructors.data ?? [])
      .map((i) => ({
        ...i,
        name:
          localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email,
      }))
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          i.email.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [instructors.data, query, locale]);

  const seasonInvalid = !SEASON_RE.test(season.trim());
  const nothingPicked = mode === 'pick' && picked.size === 0;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (seasonInvalid || nothingPicked || assign.isPending) return;
    assign.mutate(
      {
        templateId: template.id,
        season: season.trim(),
        ...(mode === 'all'
          ? { allActiveInstructors: true }
          : { instructorIds: [...picked] }),
      },
      { onSuccess: setResult },
    );
  }

  return (
    <Modal
      title={t.documents.assignTitle.replace(
        '{title}',
        templateTitle(template, locale),
      )}
      onClose={onClose}
      footer={
        result ? (
          <Button onClick={onClose}>{t.documents.done}</Button>
        ) : (
          <>
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={assign.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button
              loading={assign.isPending}
              onClick={() => submit()}
              disabled={touched && (seasonInvalid || nothingPicked)}
            >
              {t.documents.assignSubmit}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Banner tone="approved">
          {t.documents.assignResult
            .replace('{created}', String(result.created))
            .replace('{skipped}', String(result.skipped))}
        </Banner>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <Field
            label={t.documents.seasonLabel}
            hint={t.documents.seasonHint}
            required
            error={
              touched && seasonInvalid ? t.documents.seasonInvalid : undefined
            }
          >
            {(p) => (
              <Input
                {...p}
                value={season}
                placeholder="2026/27"
                onChange={(e) => setSeason(e.target.value)}
              />
            )}
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-navy">
              {t.documents.assignWho}
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="assign-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              {t.documents.assignAll}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="assign-mode"
                checked={mode === 'pick'}
                onChange={() => setMode('pick')}
              />
              {t.documents.assignPick}
            </label>
          </fieldset>
          {mode === 'pick' && (
            <div className="flex flex-col gap-2">
              <Input
                aria-label={t.documents.searchInstructors}
                placeholder={t.documents.searchInstructors}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <p className="text-xs text-slate">
                {t.documents.pickedCount.replace('{n}', String(picked.size))}
              </p>
              {instructors.isLoading ? (
                <Spinner />
              ) : (
                <ul className="max-h-64 divide-y divide-grey/40 overflow-y-auto rounded-md border border-grey/60">
                  {rows.map((i) => (
                    <li key={i.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-sunken">
                        <input
                          type="checkbox"
                          checked={picked.has(i.id)}
                          onChange={() => toggle(i.id)}
                        />
                        <span className="flex-1">
                          <span className="block text-ink">{i.name}</span>
                          <span className="block font-mono text-xs text-slate">
                            {i.email}
                          </span>
                        </span>
                        <StatusPill
                          status={i.approvalStatus}
                          isActive={i.isActive}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {touched && nothingPicked && (
                <p className="text-sm text-status-rejected">
                  {t.documents.pickAtLeastOne}
                </p>
              )}
            </div>
          )}
          {assign.isError && (
            <Banner tone="error">
              {errorText(assign.error, t.errors.generic)}
            </Banner>
          )}
        </form>
      )}
    </Modal>
  );
}
