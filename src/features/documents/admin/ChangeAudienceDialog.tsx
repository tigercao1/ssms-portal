import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Modal, Spinner } from '@/components';
import type { PublishResult, TemplateAssignTo, TemplateSummary } from '../api';
import { useChangeAudience, usePublishPreview } from './hooks';
import { errorText, templateTitle } from './format';
import { withBold } from './withBold';

export function ChangeAudienceDialog({
  template,
  onClose,
  onChanged,
}: {
  template: TemplateSummary;
  onClose: () => void;
  onChanged: (result: PublishResult) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const target: TemplateAssignTo =
    template.assignTo === 'all' ? 'selected' : 'all';
  const toAll = target === 'all';
  const preview = usePublishPreview(template.id, template.season, {
    fresh: true,
  });
  const change = useChangeAudience();
  const counts =
    preview.isFetchedAfterMount && !preview.isFetching && !preview.isError
      ? preview.data
      : undefined;
  const newCount = counts
    ? Math.max(0, counts.approvedCount - counts.alreadyAssignedCount)
    : 0;
  const label = (to: TemplateAssignTo) =>
    to === 'all'
      ? t.documents.publishAllLabel
      : t.documents.publishSelectedLabel;

  function submit() {
    if (change.isPending || (toAll && !counts)) return;
    change.mutate(
      { id: template.id, assignTo: target },
      { onSuccess: onChanged },
    );
  }

  return (
    <Modal
      title={t.documents.changeAudienceTitle.replace(
        '{title}',
        templateTitle(template, locale),
      )}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={change.isPending}>
            {t.common.cancel}
          </Button>
          <Button
            loading={change.isPending}
            disabled={toAll && !counts}
            onClick={submit}
          >
            {toAll && newCount > 0
              ? t.documents.changeAudienceAndEmail.replace(
                  '{n}',
                  String(newCount),
                )
              : t.documents.changeAudience}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          {t.documents.changeAudienceFromTo
            .replace('{from}', label(toAll ? 'selected' : 'all'))
            .replace('{to}', label(target))}
        </p>
        {!toAll ? (
          <div
            data-testid="change-audience-summary"
            className="rounded-md bg-sunken px-4 py-3 text-sm"
          >
            {t.documents.changeAudienceSelectedEffect}
          </div>
        ) : preview.isError ? (
          <Banner tone="error">
            {errorText(preview.error, t.errors.generic)}
          </Banner>
        ) : !counts ? (
          <Spinner />
        ) : (
          <div
            data-testid="change-audience-summary"
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
            <p>{t.documents.changeAudienceAllLater}</p>
          </div>
        )}
        {change.isError && (
          <Banner tone="error">
            {errorText(change.error, t.errors.generic)}
          </Banner>
        )}
      </div>
    </Modal>
  );
}
