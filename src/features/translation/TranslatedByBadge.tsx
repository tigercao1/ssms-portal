import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';

export function TranslatedByBadge({
  model,
  onTint = false,
}: {
  model: string | null | undefined;
  onTint?: boolean;
}) {
  const t = useT();
  if (!model) return null;
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-sm px-2 py-0.5 text-xs font-medium text-navy',
        onTint ? 'bg-surface' : 'bg-navy-tint',
      )}
    >
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
      <span className="text-xs text-slate">
        {t.translation.editReplacesHint}
      </span>
    </div>
  );
}
