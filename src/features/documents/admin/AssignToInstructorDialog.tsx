import { useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Modal } from '@/components';
import { cn } from '@/lib/cn';
import type { TemplateSummary } from '../api';
import { useCreateAssignments } from './hooks';
import { errorText, templateTitle } from './format';

/** Assigns one of the documents an instructor does not hold yet to that instructor. */
export function AssignToInstructorDialog({
  instructorId,
  instructorName,
  season,
  templates,
  onClose,
  onAssigned,
}: {
  instructorId: string;
  instructorName: string;
  season: string;
  templates: TemplateSummary[];
  onClose: () => void;
  onAssigned: (template: TemplateSummary) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const assign = useCreateAssignments();
  const [pickedId, setPickedId] = useState(templates[0]?.id ?? '');
  const picked = templates.find((tpl) => tpl.id === pickedId);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!picked || assign.isPending) return;
    assign.mutate(
      { templateId: picked.id, season, instructorIds: [instructorId] },
      { onSuccess: () => onAssigned(picked) },
    );
  }

  return (
    <Modal
      title={t.documents.assignDocument}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={assign.isPending}>
            {t.common.cancel}
          </Button>
          <Button
            loading={assign.isPending}
            disabled={!picked}
            onClick={() => submit()}
          >
            {t.documents.assignSubmit}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <p className="text-sm text-slate">
          {t.documents.assignDocumentIntro
            .replace('{name}', instructorName)
            .replace('{season}', season)}
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-navy">
            {t.documents.assignDocumentChoose}
          </legend>
          {templates.map((tpl) => (
            <label
              key={tpl.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm text-ink',
                tpl.id === pickedId
                  ? 'border-navy bg-navy-tint'
                  : 'border-grey/60',
              )}
            >
              <input
                type="radio"
                name="assign-document"
                value={tpl.id}
                checked={tpl.id === pickedId}
                onChange={() => {
                  setPickedId(tpl.id);
                  assign.reset();
                }}
              />
              {templateTitle(tpl, locale)}
            </label>
          ))}
        </fieldset>
        {assign.isError && (
          <Banner tone="error">
            {errorText(assign.error, t.errors.generic)}
          </Banner>
        )}
      </form>
    </Modal>
  );
}
