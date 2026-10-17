import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Modal } from '@/components';
import type { TemplateSummary } from '../api';
import { useDeleteTemplate } from './hooks';
import { errorText, templateTitle } from './format';

export function DeleteTemplateDialog({
  template,
  onClose,
  onDeleted,
}: {
  template: TemplateSummary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const remove = useDeleteTemplate();
  const assigned = template.assignedCount;

  function submit() {
    if (remove.isPending) return;
    remove.mutate(template.id, { onSuccess: onDeleted });
  }

  return (
    <Modal
      title={t.documents.deleteTitle.replace(
        '{title}',
        templateTitle(template, locale),
      )}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={remove.isPending}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={submit}>
            {t.documents.deleteConfirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div
          data-testid="delete-template-summary"
          className="flex flex-col gap-1 rounded-md bg-sunken px-4 py-3 text-sm"
        >
          <p>
            {assigned > 0
              ? t.documents.deleteAssigned.replace('{n}', String(assigned))
              : t.documents.deleteAssignedNone}
          </p>
          <p className="font-medium">{t.documents.deleteIrreversible}</p>
        </div>
        {remove.isError && (
          <Banner tone="error">
            {errorText(remove.error, t.errors.generic)}
          </Banner>
        )}
      </div>
    </Modal>
  );
}
