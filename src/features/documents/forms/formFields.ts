import type { Messages } from '@/i18n/core/types';
import type { DocumentLanguage, FieldType } from '../api';
import {
  DEFAULT_LABELS,
  DEFAULT_SIZE,
  fitToPage,
  newFieldId,
} from '../admin/editor/fieldModel';
import { screenRectToPdf, viewportGeometry } from '../pdf/transforms';
import {
  FORM_FIELD_KEY_PATTERN,
  FORM_MAX_FIELDS,
  type FormDraft,
  type FormField,
  type FormFieldType,
  type FormPdfPage,
  type FormPlacement,
  type FormVersion,
} from './api';

export interface DraftField extends FormField {
  id: string;
}

export interface DraftPlacement extends Omit<FormPlacement, 'key'> {
  id: string;
  fieldId: string;
}

export interface EditorDraft {
  title: string;
  bodyMarkdown: string;
  fields: DraftField[];
  placements: DraftPlacement[];
}

export interface FieldIssues {
  key?: string;
  label?: string;
}

export const EDITOR_TYPE: Record<FormFieldType, FieldType> = {
  text: 'text',
  full_name: 'full_name',
  email: 'text',
  date: 'date',
  checkbox: 'checkbox',
  initials: 'initials',
  signature: 'signature',
};

const LABELS: Record<FormFieldType, Record<DocumentLanguage, string>> = {
  ...DEFAULT_LABELS,
  email: { en: 'Email', zh: '电子邮箱' },
};

const REQUIRED_BY_DEFAULT = new Set<FormFieldType>([
  'full_name',
  'email',
  'date',
  'initials',
  'signature',
]);

export function toEditor(draft: FormDraft): EditorDraft {
  const fields = draft.fields.map((f, i) => ({ ...f, id: `f${i}` }));
  const idOf = new Map(fields.map((f) => [f.key, f.id]));
  return {
    title: draft.title,
    bodyMarkdown: draft.bodyMarkdown,
    fields,
    placements: draft.placements.flatMap(({ key, ...rect }, i) => {
      const fieldId = idOf.get(key);
      return fieldId ? [{ ...rect, id: `p${i}`, fieldId }] : [];
    }),
  };
}

export function toFormDraft(draft: EditorDraft): FormDraft {
  const keyOf = new Map(draft.fields.map((f) => [f.id, f.key]));
  return {
    title: draft.title,
    bodyMarkdown: draft.bodyMarkdown,
    fields: draft.fields.map(({ key, type, label, required }) => ({
      key,
      type,
      label,
      required,
    })),
    placements: draft.placements.flatMap(({ fieldId, page, x, y, w, h }) => {
      const key = keyOf.get(fieldId);
      return key === undefined ? [] : [{ key, page, x, y, w, h }];
    }),
  };
}

const STACK_MARGIN = 36;
const STACK_GAP = 8;

export function stackUnplaced(
  draft: EditorDraft,
  page: FormPdfPage | undefined,
): { draft: EditorDraft; stacked: number } {
  const placed = new Set(draft.placements.map((p) => p.fieldId));
  const unplaced = draft.fields.filter((f) => !placed.has(f.id));
  if (!page || unplaced.length === 0) return { draft, stacked: 0 };
  const g = viewportGeometry({
    viewBox: [page.x, page.y, page.x + page.width, page.y + page.height],
    scale: 1,
    rotation: page.rotate,
  });
  const ids = draft.placements.map((p) => p.id);
  let left = STACK_MARGIN;
  let top = STACK_MARGIN;
  let columnWidth = 0;
  const added = unplaced.map((field): DraftPlacement => {
    const size = DEFAULT_SIZE[EDITOR_TYPE[field.type]];
    if (top + size.h > g.height - STACK_MARGIN && top > STACK_MARGIN) {
      left += columnWidth + STACK_GAP * 2;
      top = STACK_MARGIN;
      columnWidth = 0;
    }
    const rect = fitToPage(
      screenRectToPdf(g, { left, top, width: size.w, height: size.h }),
      g,
    );
    top += size.h + STACK_GAP;
    columnWidth = Math.max(columnWidth, size.w);
    const id = newFieldId(ids);
    ids.push(id);
    return { id, fieldId: field.id, page: 1, ...rect };
  });
  return {
    draft: { ...draft, placements: [...draft.placements, ...added] },
    stacked: added.length,
  };
}

export function newField(
  type: FormFieldType,
  lang: DocumentLanguage,
  fields: DraftField[],
): DraftField {
  const keys = new Set(fields.map((f) => f.key));
  let key: string = type;
  for (let n = 2; keys.has(key); n += 1) key = `${type}_${n}`;
  return {
    id: newFieldId(fields.map((f) => f.id)),
    key,
    type,
    label: LABELS[type][lang],
    required: REQUIRED_BY_DEFAULT.has(type),
  };
}

export function changeFieldType(
  field: DraftField,
  type: FormFieldType,
  lang: DocumentLanguage,
): DraftField {
  return {
    ...field,
    type,
    label:
      field.label === LABELS[field.type][lang]
        ? LABELS[type][lang]
        : field.label,
  };
}

export function fieldIssues(
  fields: DraftField[],
  t: Messages,
): Map<string, FieldIssues> {
  const s = t.signingForms;
  const counts = new Map<string, number>();
  for (const f of fields) counts.set(f.key, (counts.get(f.key) ?? 0) + 1);
  const issues = new Map<string, FieldIssues>();
  for (const f of fields) {
    const key = !FORM_FIELD_KEY_PATTERN.test(f.key)
      ? s.keyInvalid
      : (counts.get(f.key) ?? 0) > 1
        ? s.keyTaken
        : undefined;
    const label = f.label.trim() ? undefined : s.labelMissing;
    if (key || label) issues.set(f.id, { key, label });
  }
  return issues;
}

export function fieldsProblem(fields: DraftField[], t: Messages) {
  const s = t.signingForms;
  if (fields.length > FORM_MAX_FIELDS)
    return s.tooManyFields.replace('{n}', String(FORM_MAX_FIELDS));
  return fieldIssues(fields, t).size > 0 ? s.fieldsInvalid : null;
}

export function signerFieldIds(fields: readonly DraftField[]) {
  const first = (type: FormFieldType) =>
    fields.find((f) => f.type === type && f.required)?.id;
  return { name: first('full_name'), email: first('email') };
}

export function publishProblems(version: FormVersion, t: Messages): string[] {
  const s = t.signingForms;
  const problems: string[] = [];
  if (!version.originalPdf && !version.bodyMarkdown.trim())
    problems.push(s.publishNeedsContent);
  const required = (type: FormFieldType) =>
    version.fields.some((f) => f.type === type && f.required);
  if (!required('full_name')) problems.push(s.publishNeedsName);
  if (!required('email')) problems.push(s.publishNeedsEmail);
  return problems;
}
