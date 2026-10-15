import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Input, Modal, Spinner } from '@/components';
import { cn } from '@/lib/cn';
import type { PublishResult, TemplateAssignTo, TemplateSummary } from '../api';
import { SEASON_RE } from './AssignDialog';
import { usePublishPreview, usePublishTemplate } from './hooks';
import { errorText, templateTitle } from './format';

function withBold(template: string, value: string): ReactNode {
  const [before, after] = template.split('{count}');
  return (
    <>
      {before}
      <b className="text-navy">{value}</b>
      {after}
    </>
  );
}

function AudienceOption({
  checked,
  label,
  hint,
  onSelect,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-md border p-3 text-sm',
        checked ? 'border-navy bg-navy-tint' : 'border-grey/60',
      )}
    >
      <input
        type="radio"
        name="publish-audience"
        className="mt-1"
        checked={checked}
        onChange={onSelect}
      />
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        <span className="block text-slate">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Publishes (or re-publishes) a template for an audience and season, showing
 * from `publish-preview` who is assigned and emailed now and who gets it on
 * approval.
 */
export function PublishDialog({
  template,
  onClose,
  onPublished,
}: {
  template: TemplateSummary;
  onClose: () => void;
  onPublished: (result: PublishResult) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const canAssignAll = template.audience === 'instructor';
  const [assignTo, setAssignTo] = useState<TemplateAssignTo>(
    canAssignAll ? 'all' : 'selected',
  );
  const [seasonInput, setSeasonInput] = useState<string | null>(null);
  const seasonValid =
    seasonInput === null || SEASON_RE.test(seasonInput.trim());
  const [querySeason, setQuerySeason] = useState<string | null>(null);
  const preview = usePublishPreview(template.id, querySeason);
  const publish = usePublishTemplate();
  const season = seasonInput ?? preview.data?.season ?? '';
  const ready = Boolean(preview.data) && seasonValid && season !== '';

  const counts = preview.data;
  const newCount = counts
    ? Math.max(0, counts.approvedCount - counts.alreadyAssignedCount)
    : 0;
  const emails = assignTo === 'all' ? newCount : 0;

  function changeSeason(value: string) {
    setSeasonInput(value);
    if (SEASON_RE.test(value.trim())) setQuerySeason(value.trim());
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || publish.isPending) return;
    publish.mutate(
      { id: template.id, assignTo, season: season.trim() },
      { onSuccess: onPublished },
    );
  }

  return (
    <Modal
      title={t.documents.publishTitle.replace(
        '{title}',
        templateTitle(template, locale),
      )}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={publish.isPending}
          >
            {t.common.cancel}
          </Button>
          <Button
            loading={publish.isPending}
            disabled={!ready}
            onClick={() => submit()}
          >
            {emails > 0
              ? t.documents.publishAndEmail.replace('{n}', String(emails))
              : t.documents.publish}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <p className="text-sm text-slate">{t.documents.publishIntro}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-navy">
            {t.documents.publishWho}
          </legend>
          {canAssignAll && (
            <AudienceOption
              checked={assignTo === 'all'}
              label={t.documents.publishAllLabel}
              hint={t.documents.publishAllHint}
              onSelect={() => setAssignTo('all')}
            />
          )}
          <AudienceOption
            checked={assignTo === 'selected'}
            label={t.documents.publishSelectedLabel}
            hint={t.documents.publishSelectedHint}
            onSelect={() => setAssignTo('selected')}
          />
        </fieldset>
        <Field
          label={t.documents.seasonLabel}
          required
          error={seasonValid ? undefined : t.documents.seasonInvalid}
        >
          {(p) => (
            <Input
              {...p}
              className="max-w-[10rem]"
              value={season}
              placeholder="2026/27"
              onChange={(e) => changeSeason(e.target.value)}
            />
          )}
        </Field>
        {preview.isError ? (
          <Banner tone="error">
            {errorText(preview.error, t.errors.generic)}
          </Banner>
        ) : !counts ? (
          <Spinner />
        ) : (
          assignTo === 'all' && (
            <div
              data-testid="publish-summary"
              className="flex flex-col gap-1 rounded-md bg-sunken px-4 py-3 text-sm"
            >
              <p>
                {withBold(
                  t.documents.publishAssignsNow,
                  t.documents.publishApprovedCount.replace(
                    '{n}',
                    String(newCount),
                  ),
                )}
              </p>
              {counts.alreadyAssignedCount > 0 && (
                <p className="text-slate">
                  {t.documents.publishAlreadyAssigned.replace(
                    '{n}',
                    String(counts.alreadyAssignedCount),
                  )}
                </p>
              )}
              <p>
                {withBold(
                  t.documents.publishPendingLater,
                  t.documents.publishPendingCount.replace(
                    '{n}',
                    String(counts.pendingCount),
                  ),
                )}
              </p>
            </div>
          )
        )}
        {publish.isError && (
          <Banner tone="error">
            {errorText(publish.error, t.errors.generic)}
          </Banner>
        )}
      </form>
    </Modal>
  );
}
