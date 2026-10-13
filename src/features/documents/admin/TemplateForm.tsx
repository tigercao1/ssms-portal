import { useState, type FormEvent } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import {
  Banner,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
} from '@/components';
import type {
  TemplateCreate,
  TemplateKind,
  TemplatePatch,
  TemplateSummary,
} from '../api';
import { errorText } from './format';

export interface TemplateFormValues {
  kind: TemplateKind;
  titleEn: string;
  titleZh: string;
  descriptionEn: string;
  descriptionZh: string;
  required: boolean;
  sortOrder: string;
}

export const EMPTY_TEMPLATE_VALUES: TemplateFormValues = {
  kind: 'sign',
  titleEn: '',
  titleZh: '',
  descriptionEn: '',
  descriptionZh: '',
  required: true,
  sortOrder: '0',
};

export function templateToValues(t: TemplateSummary): TemplateFormValues {
  return {
    kind: t.kind,
    titleEn: t.titleEn,
    titleZh: t.titleZh ?? '',
    descriptionEn: t.descriptionEn ?? '',
    descriptionZh: t.descriptionZh ?? '',
    required: t.required,
    sortOrder: String(t.sortOrder),
  };
}

export function valuesToCreate(v: TemplateFormValues): TemplateCreate {
  return {
    kind: v.kind,
    audience: 'instructor',
    titleEn: v.titleEn.trim(),
    ...(v.titleZh.trim() && { titleZh: v.titleZh.trim() }),
    ...(v.descriptionEn.trim() && { descriptionEn: v.descriptionEn.trim() }),
    ...(v.descriptionZh.trim() && { descriptionZh: v.descriptionZh.trim() }),
    required: v.required,
    sortOrder: Number.parseInt(v.sortOrder, 10) || 0,
  };
}

/** Only the metadata keys that changed, as a PATCH body. */
export function valuesToPatch(
  before: TemplateSummary,
  v: TemplateFormValues,
): TemplatePatch {
  const patch: TemplatePatch = {};
  const text = (s: string) => s.trim() || null;
  if (v.titleEn.trim() !== before.titleEn) patch.titleEn = v.titleEn.trim();
  if (text(v.titleZh) !== before.titleZh) patch.titleZh = text(v.titleZh);
  if (text(v.descriptionEn) !== before.descriptionEn)
    patch.descriptionEn = text(v.descriptionEn);
  if (text(v.descriptionZh) !== before.descriptionZh)
    patch.descriptionZh = text(v.descriptionZh);
  if (v.required !== before.required) patch.required = v.required;
  const sort = Number.parseInt(v.sortOrder, 10) || 0;
  if (sort !== before.sortOrder) patch.sortOrder = sort;
  return patch;
}

/** Title, description, kind, required and sort order for a template. */
export function TemplateForm({
  initial,
  kindEditable,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: TemplateFormValues;
  kindEditable: boolean;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: TemplateFormValues) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof TemplateFormValues>(
    key: K,
    value: TemplateFormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));
  const titleMissing = !values.titleEn.trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (titleMissing || pending) return;
    onSubmit(values);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={submit}
      noValidate
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onCancel && !pending) onCancel();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t.documents.titleEnLabel}
          required
          error={touched && titleMissing ? t.validation.required : undefined}
        >
          {(p) => (
            <Input
              {...p}
              value={values.titleEn}
              onChange={(e) => set('titleEn', e.target.value)}
            />
          )}
        </Field>
        <Field label={t.documents.titleZhLabel}>
          {(p) => (
            <Input
              {...p}
              value={values.titleZh}
              onChange={(e) => set('titleZh', e.target.value)}
            />
          )}
        </Field>
        <Field label={t.documents.descriptionEnLabel}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={values.descriptionEn}
              onChange={(e) => set('descriptionEn', e.target.value)}
            />
          )}
        </Field>
        <Field label={t.documents.descriptionZhLabel}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={values.descriptionZh}
              onChange={(e) => set('descriptionZh', e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t.documents.kindLabel}
          hint={kindEditable ? t.documents.kindHint : t.documents.kindLocked}
        >
          {(p) => (
            <Select
              {...p}
              value={values.kind}
              disabled={!kindEditable}
              onChange={(e) => set('kind', e.target.value as TemplateKind)}
            >
              <option value="sign">{t.documents.kindSign}</option>
              <option value="read">{t.documents.kindRead}</option>
            </Select>
          )}
        </Field>
        <Field label={t.documents.sortOrderLabel}>
          {(p) => (
            <Input
              {...p}
              type="number"
              value={values.sortOrder}
              onChange={(e) => set('sortOrder', e.target.value)}
            />
          )}
        </Field>
        <span className="flex items-center gap-2">
          <Toggle
            checked={values.required}
            onChange={(next) => set('required', next)}
            label={t.documents.requiredLabel}
          />
          <span className="text-sm text-slate">
            {t.documents.requiredLabel}
          </span>
        </span>
      </div>
      {Boolean(error) && (
        <Banner tone="error">{errorText(error, t.errors.generic)}</Banner>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            {t.common.cancel}
          </Button>
        )}
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
