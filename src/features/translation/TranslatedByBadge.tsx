import { useT } from '@/i18n/core/I18nProvider';

export function TranslatedByBadge({ model }: { model: string | null | undefined }) {
  const t = useT();
  if (!model) return null;
  return (
    <span className="inline-flex w-fit items-center rounded-sm bg-navy-tint px-2 py-0.5 text-xs font-medium text-navy">
      {t.translation.badge.replace('{model}', model)}
    </span>
  );
}

export function MachineTranslationNote({
  model,
}: {
  model: string | null | undefined;
}) {
  const t = useT();
  if (!model) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TranslatedByBadge model={model} />
      <span className="text-xs text-slate">{t.translation.editReplacesHint}</span>
    </div>
  );
}
