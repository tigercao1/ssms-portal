import { useEffect, useState } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { Button, Field as FormField, Input, Select } from '@/components';
import {
  FIELD_TYPES,
  type Field,
  type FieldPrefill,
  type FieldType,
} from '../../api';
import { allowedPrefills, changeType, MIN_FIELD_PT } from './fieldModel';
import { useFieldTypeLabel, usePrefillLabel } from './labels';

/** Edits the selected field's type, labels, required flag, prefill and rect. */
export function PropertiesPanel({
  field,
  pageLabel,
  onChange,
  onDuplicate,
  onDelete,
}: {
  field: Field;
  pageLabel: string;
  onChange: (next: Field) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const typeLabel = useFieldTypeLabel();
  const prefillLabel = usePrefillLabel();
  const set = <K extends keyof Field>(key: K, value: Field[K]) =>
    onChange({ ...field, [key]: value });

  return (
    <div className="flex flex-col gap-3" aria-label={t.documents.properties}>
      <h2 className="text-lg">{t.documents.properties}</h2>
      <FormField label={t.documents.fieldType}>
        {(p) => (
          <Select
            {...p}
            value={field.type}
            onChange={(e) =>
              onChange(changeType(field, e.target.value as FieldType))
            }
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField
        label={t.documents.labelEn}
        required
        error={field.labelEn.trim() ? undefined : t.validation.required}
      >
        {(p) => (
          <Input
            {...p}
            value={field.labelEn}
            onChange={(e) => set('labelEn', e.target.value)}
          />
        )}
      </FormField>
      <FormField label={t.documents.labelZh}>
        {(p) => (
          <Input
            {...p}
            value={field.labelZh ?? ''}
            onChange={(e) => set('labelZh', e.target.value || null)}
          />
        )}
      </FormField>
      <label className="flex items-center gap-2 text-sm text-navy">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => set('required', e.target.checked)}
        />
        {t.documents.fieldRequired}
      </label>
      <FormField label={t.documents.prefill}>
        {(p) => (
          <Select
            {...p}
            value={field.prefill ?? ''}
            disabled={allowedPrefills(field.type).length < 2}
            onChange={(e) =>
              set('prefill', (e.target.value || null) as FieldPrefill)
            }
          >
            {allowedPrefills(field.type).map((v) => (
              <option key={v ?? 'none'} value={v ?? ''}>
                {prefillLabel(v)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-navy">{t.documents.position}</p>
        <p className="text-xs text-slate">{pageLabel}</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberBox label="x" value={field.x} onCommit={(v) => set('x', v)} />
          <NumberBox label="y" value={field.y} onCommit={(v) => set('y', v)} />
          <NumberBox
            label="w"
            value={field.w}
            min={MIN_FIELD_PT}
            onCommit={(v) => set('w', v)}
          />
          <NumberBox
            label="h"
            value={field.h}
            min={MIN_FIELD_PT}
            onCommit={(v) => set('h', v)}
          />
        </div>
      </div>
      <p className="text-xs text-slate">{t.documents.keyboardHint}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onDuplicate}>
          {t.documents.duplicate}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          {t.documents.deleteField}
        </Button>
      </div>
    </div>
  );
}

function NumberBox({
  label,
  value,
  min = 0,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  function commit() {
    const n = Number.parseFloat(text);
    if (Number.isFinite(n) && n >= min) onCommit(n);
    else setText(String(value));
  }
  return (
    <label className="flex items-center gap-2 text-sm text-slate">
      <span className="w-3 font-mono">{label}</span>
      <Input
        inputMode="decimal"
        aria-label={label}
        className="h-9 font-mono text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </label>
  );
}
