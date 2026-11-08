import { useState } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { Button, Input, Select, Toggle } from '@/components';
import {
  FORM_TITLE_MAX,
  SIGNER_EMAIL_KEY,
  SIGNER_NAME_KEY,
  type FormField,
  type FormFieldType,
} from './api';

const LOCKED_KEYS = new Set([SIGNER_NAME_KEY, SIGNER_EMAIL_KEY]);

export function fieldTypeLabel(type: FormFieldType, t: Messages): string {
  const s = t.signingForms;
  return {
    text: s.typeText,
    email: s.typeEmail,
    date: s.typeDate,
    signature: s.typeSignature,
  }[type];
}

export function fieldsProblem(fields: FormField[], t: Messages): string | null {
  if (fields.some((f) => !f.label.trim())) return t.signingForms.labelMissing;
  if (!fields.some((f) => f.type === 'signature' && f.required))
    return t.signingForms.needSignature;
  return null;
}

export function FieldList({
  fields,
  defaults,
  onChange,
}: {
  fields: FormField[];
  defaults: FormField[];
  onChange: (fields: FormField[]) => void;
}) {
  const t = useT();
  const s = t.signingForms;
  const present = new Set(fields.map((f) => f.key));
  const addable = defaults.filter((f) => !present.has(f.key));
  const [adding, setAdding] = useState('');
  const toAdd = addable.find((f) => f.key === adding) ?? addable[0];

  const patch = (key: string, next: Partial<FormField>) =>
    onChange(fields.map((f) => (f.key === key ? { ...f, ...next } : f)));

  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label={s.fieldsLabel}
        className="flex flex-col divide-y divide-grey/40 rounded-md border border-grey/60"
      >
        {fields.map((field) => {
          const locked = LOCKED_KEYS.has(field.key);
          const label = field.label || field.key;
          return (
            <li
              key={field.key}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2 text-xs text-slate">
                  <span className="rounded-sm bg-navy-tint px-1.5 py-0.5 font-medium text-navy">
                    {fieldTypeLabel(field.type, t)}
                  </span>
                  <span className="font-mono">{field.key}</span>
                </div>
                <Input
                  aria-label={s.labelFor.replace('{key}', field.key)}
                  value={field.label}
                  maxLength={FORM_TITLE_MAX}
                  aria-invalid={!field.label.trim()}
                  onChange={(e) => patch(field.key, { label: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                {locked ? (
                  <span className="text-xs text-slate">{s.alwaysRequired}</span>
                ) : (
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <Toggle
                      checked={field.required}
                      label={s.requiredFor.replace('{label}', label)}
                      onChange={(required) => patch(field.key, { required })}
                    />
                    {s.required}
                  </label>
                )}
                {!locked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={s.removeField.replace('{label}', label)}
                    onClick={() =>
                      onChange(fields.filter((f) => f.key !== field.key))
                    }
                  >
                    {t.common.remove}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {toAdd && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={s.addField}
            value={toAdd.key}
            onChange={(e) => setAdding(e.target.value)}
            className="w-auto"
          >
            {addable.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label} ({fieldTypeLabel(f.type, t)})
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              onChange([...fields, toAdd]);
              setAdding('');
            }}
          >
            {s.addFieldButton}
          </Button>
        </div>
      )}
    </div>
  );
}
