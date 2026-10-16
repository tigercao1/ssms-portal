import { useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Input, Modal } from '@/components';
import { todayIso, type AssignResult, type TemplateSummary } from '../api';
import { useCreateAssignments } from './hooks';
import { errorText, templateTitle } from './format';
import { InstructorPicker, useToggleSet } from './InstructorPicker';

export const SEASON_RE = /^\d{4}\/\d{2}$/;

/**
 * Ski season label for a date in America/Toronto, e.g. `2026/27` from
 * August 2026 through July 2027.
 */
export function seasonFor(now: Date = new Date()): string {
  const today = todayIso(now);
  const year = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 8 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Assigns a template to picked instructors for a season. */
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
  const assign = useCreateAssignments();
  const [season, setSeason] = useState(seasonFor);
  const [picked, toggle] = useToggleSet(initialInstructorIds);
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<AssignResult | null>(null);

  const seasonInvalid = !SEASON_RE.test(season.trim());
  const nothingPicked = picked.size === 0;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (seasonInvalid || nothingPicked || assign.isPending) return;
    assign.mutate(
      {
        templateId: template.id,
        season: season.trim(),
        instructorIds: [...picked],
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
          <InstructorPicker
            picked={picked}
            onToggle={toggle}
            showError={touched && nothingPicked}
          />
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
