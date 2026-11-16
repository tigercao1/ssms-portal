import { useState } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { Button, Input, Select, Toggle } from '@/components';
import type { DocumentLanguage } from '../api';
import {
  FORM_FIELD_KEY_MAX,
  FORM_FIELD_TYPES,
  FORM_TITLE_MAX,
  type FormFieldType,
} from './api';
import {
  changeFieldType,
  newField,
  signerFieldIds,
  type DraftField,
  type FieldIssues,
} from './formFields';

export function fieldTypeLabel(type: FormFieldType, t: Messages): string {
  const s = t.signingForms;
  return {
    text: s.typeText,
    full_name: s.typeFullName,
    email: s.typeEmail,
    date: s.typeDate,
    checkbox: s.typeCheckbox,
    initials: s.typeInitials,
    signature: s.typeSignature,
  }[type];
}

export function FieldTypeSelect({
  value,
  label,
  className,
  onChange,
}: {
  value: FormFieldType;
  label: string;
  className?: string;
  onChange: (type: FormFieldType) => void;
}) {
  const t = useT();
  return (
    <Select
      aria-label={label}
      value={value}
      className={className}
      onChange={(e) => onChange(e.target.value as FormFieldType)}
    >
      {FORM_FIELD_TYPES.map((type) => (
        <option key={type} value={type}>
          {fieldTypeLabel(type, t)}
        </option>
      ))}
    </Select>
  );
}

export function SignerBadge({ label }: { label: string }) {
  return (
    <span className="w-fit rounded-sm bg-navy-tint px-1.5 py-0.5 text-xs font-medium text-navy">
      {label}
    </span>
  );
}

export function FieldList({
  fields,
  lang,
  issues,
  onChange,
}: {
  fields: DraftField[];
  lang: DocumentLanguage;
  issues: Map<string, FieldIssues>;
  onChange: (fields: DraftField[]) => void;
}) {
  const t = useT();
  const s = t.signingForms;
  const [adding, setAdding] = useState<FormFieldType>('text');
  const signer = signerFieldIds(fields);

  const setFields = onChange;
  const patch = (id: string, next: Partial<DraftField>) =>
    setFields(fields.map((f) => (f.id === id ? { ...f, ...next } : f)));
  const move = (index: number, by: number) => {
    const field = fields[index];
    if (!field) return;
    const next = fields.filter((_, i) => i !== index);
    next.splice(index + by, 0, field);
    setFields(next);
  };
  const remove = (id: string) => setFields(fields.filter((f) => f.id !== id));

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="rounded-md border border-dashed border-grey p-3 text-sm text-slate">
          {s.noFields}
        </p>
      ) : (
        <ul
          aria-label={s.fieldsLabel}
          className="flex flex-col divide-y divide-grey/40 rounded-md border border-grey/60"
        >
          <li
            aria-hidden
            className="hidden gap-2 px-3 pt-2 text-xs font-medium text-slate sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1.3fr)_auto]"
          >
            <span>{s.fieldType}</span>
            <span>{s.fieldKey}</span>
            <span>{s.fieldLabel}</span>
            <span className="w-52" />
          </li>
          {fields.map((field, index) => {
            const issue = issues.get(field.id);
            const name = field.label.trim() || field.key;
            const role =
              signer.name === field.id
                ? s.signerName
                : signer.email === field.id
                  ? s.signerEmail
                  : null;
            return (
              <li
                key={field.id}
                role="group"
                aria-label={s.fieldN.replace('{n}', String(index + 1))}
                className="flex flex-col gap-1.5 p-3"
              >
                <div className="grid gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-start">
                  <FieldTypeSelect
                    label={s.fieldType}
                    value={field.type}
                    className="h-10 text-sm"
                    onChange={(type) =>
                      setFields(
                        fields.map((f) =>
                          f.id === field.id
                            ? changeFieldType(f, type, lang)
                            : f,
                        ),
                      )
                    }
                  />
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={s.fieldKey}
                      value={field.key}
                      maxLength={FORM_FIELD_KEY_MAX}
                      spellCheck={false}
                      autoCapitalize="off"
                      className="h-10 font-mono text-sm"
                      aria-invalid={issue?.key ? true : undefined}
                      onChange={(e) => patch(field.id, { key: e.target.value })}
                    />
                    {issue?.key && (
                      <p className="text-xs text-status-rejected">
                        {issue.key}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={s.fieldLabel}
                      value={field.label}
                      maxLength={FORM_TITLE_MAX}
                      className="h-10 text-sm"
                      aria-invalid={issue?.label ? true : undefined}
                      onChange={(e) =>
                        patch(field.id, { label: e.target.value })
                      }
                    />
                    {issue?.label && (
                      <p className="text-xs text-status-rejected">
                        {issue.label}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 sm:w-52 sm:justify-end">
                    <label className="mr-1 flex items-center gap-2 text-sm text-ink">
                      <Toggle
                        checked={field.required}
                        label={s.requiredFor.replace('{label}', name)}
                        onChange={(required) => patch(field.id, { required })}
                      />
                      {s.required}
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === 0}
                      aria-label={s.moveUp.replace('{label}', name)}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === fields.length - 1}
                      aria-label={s.moveDown.replace('{label}', name)}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={s.removeField.replace('{label}', name)}
                      onClick={() => remove(field.id)}
                    >
                      {t.common.remove}
                    </Button>
                  </div>
                </div>
                {role && <SignerBadge label={role} />}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <FieldTypeSelect
          label={s.addFieldType}
          value={adding}
          className="h-10 w-auto text-sm"
          onChange={setAdding}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setFields([...fields, newField(adding, lang, fields)])}
        >
          {s.addFieldButton}
        </Button>
      </div>
    </div>
  );
}
