import { useT } from '@/i18n/core/I18nProvider';
import type { FieldPrefill, FieldType } from '../../api';

export function useFieldTypeLabel() {
  const t = useT();
  const labels: Record<FieldType, string> = {
    signature: t.documents.typeSignature,
    initials: t.documents.typeInitials,
    full_name: t.documents.typeFullName,
    date: t.documents.typeDate,
    text: t.documents.typeText,
    checkbox: t.documents.typeCheckbox,
  };
  return (type: FieldType) => labels[type];
}

export function usePrefillLabel() {
  const t = useT();
  return (prefill: FieldPrefill) =>
    prefill === 'full_name'
      ? t.documents.prefillFullName
      : prefill === 'email'
        ? t.documents.prefillEmail
        : prefill === 'date_signed'
          ? t.documents.prefillDateSigned
          : t.documents.prefillNone;
}

export const FIELD_ICONS: Record<FieldType, string> = {
  signature: '✎',
  initials: 'AB',
  full_name: 'Aa',
  date: '📅',
  text: 'T',
  checkbox: '☑',
};
