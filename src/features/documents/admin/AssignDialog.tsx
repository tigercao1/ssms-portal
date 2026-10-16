import { useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Modal } from '@/components';
import { currentSeasonKey, useSeasons } from '@/features/reference/api';
import { SeasonSelect } from '@/features/reference/SeasonSelect';
import type { AssignResult, TemplateSummary } from '../api';
import { useCreateAssignments } from './hooks';
import { errorText, templateTitle } from './format';
import { InstructorPicker, useToggleSet } from './InstructorPicker';

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
  const seasons = useSeasons();
  const [pickedSeason, setPickedSeason] = useState<string | null>(null);
  const season = pickedSeason ?? currentSeasonKey(seasons.data);
  const [picked, toggle] = useToggleSet(initialInstructorIds);
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<AssignResult | null>(null);

  const seasonInvalid = season === '';
  const nothingPicked = picked.size === 0;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (seasonInvalid || nothingPicked || assign.isPending) return;
    assign.mutate(
      {
        templateId: template.id,
        season,
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
            error={touched && seasonInvalid ? t.seasons.required : undefined}
          >
            {(p) => (
              <SeasonSelect {...p} value={season} onChange={setPickedSeason} />
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
