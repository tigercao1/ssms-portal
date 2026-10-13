import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { cn } from '@/lib/cn';
import type { Field } from '../../api';
import type { ScreenRect } from '../../pdf/transforms';
import { todayIso } from '../../api';

/** Read-only rendering of a field roughly as the signer will see it. */
export function SignerPreviewField({
  field,
  rect,
}: {
  field: Field;
  rect: ScreenRect;
}) {
  const t = useT();
  const { locale } = useLocale();
  const label = localizeField(field.labelEn, field.labelZh, locale);
  const sample =
    field.prefill === 'full_name'
      ? t.documents.sampleName
      : field.prefill === 'email'
        ? 'alex@example.com'
        : field.prefill === 'date_signed'
          ? todayIso()
          : null;
  const isSignature = field.type === 'signature' || field.type === 'initials';

  return (
    <div
      data-testid={`preview-${field.id}`}
      title={label}
      className={cn(
        'absolute flex items-center overflow-hidden rounded-sm border text-[11px] leading-none',
        isSignature
          ? 'border-dashed border-red bg-red/5 text-red'
          : 'border-status-pending bg-status-pending/10 text-ink',
      )}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    >
      {field.type === 'checkbox' ? (
        <span aria-hidden className="mx-auto">
          ☐
        </span>
      ) : isSignature ? (
        <span className="truncate px-1">
          ✎ {t.documents.tapToSign.replace('{label}', label)}
        </span>
      ) : (
        <span className={cn('truncate px-1', !sample && 'text-slate')}>
          {sample ?? label}
          {field.required && !sample && ' *'}
        </span>
      )}
    </div>
  );
}
