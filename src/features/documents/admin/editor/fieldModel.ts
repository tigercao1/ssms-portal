import type { Field, FieldPrefill, FieldType } from '../../api';
import {
  clampPdfRect,
  pdfPageBox,
  pdfRectToScreen,
  roundPdfRect,
  screenRectToPdf,
  type PageGeometry,
  type PdfRect,
} from '../../pdf/transforms';

export const MIN_FIELD_PT = 8;

/** Visual size (as seen on the rendered page) of a newly placed field, in points. */
export const DEFAULT_SIZE: Record<FieldType, { w: number; h: number }> = {
  signature: { w: 180, h: 36 },
  initials: { w: 60, h: 30 },
  full_name: { w: 200, h: 22 },
  date: { w: 110, h: 22 },
  text: { w: 200, h: 22 },
  checkbox: { w: 16, h: 16 },
};

export const DEFAULT_LABELS: Record<FieldType, { en: string; zh: string }> = {
  signature: { en: 'Signature', zh: '签名' },
  initials: { en: 'Initials', zh: '姓名缩写' },
  full_name: { en: 'Full name', zh: '姓名' },
  date: { en: 'Date', zh: '日期' },
  text: { en: 'Text', zh: '文本' },
  checkbox: { en: 'Checkbox', zh: '复选框' },
};

const PREFILLS: Record<FieldType, FieldPrefill[]> = {
  signature: [null],
  initials: [null],
  full_name: [null, 'full_name'],
  date: [null, 'date_signed'],
  text: [null, 'full_name', 'email'],
  checkbox: [null],
};

const DEFAULT_PREFILL: Record<FieldType, FieldPrefill> = {
  signature: null,
  initials: null,
  full_name: 'full_name',
  date: 'date_signed',
  text: null,
  checkbox: null,
};

export function allowedPrefills(type: FieldType): FieldPrefill[] {
  return PREFILLS[type];
}

/** CSS pixels per PDF point for a rendered page. */
export function scaleOf(g: PageGeometry): number {
  const [a, b] = g.transform;
  return Math.hypot(a, b) || 1;
}

export function newFieldId(existing: Iterable<string>): string {
  const taken = new Set(existing);
  for (;;) {
    const id = `f_${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
}

/** Keeps a rect on its page, at least {@link MIN_FIELD_PT} each way, rounded. */
export function fitToPage(rect: PdfRect, g: PageGeometry): PdfRect {
  const sized = {
    ...rect,
    w: Math.max(rect.w, MIN_FIELD_PT),
    h: Math.max(rect.h, MIN_FIELD_PT),
  };
  return roundPdfRect(clampPdfRect(sized, pdfPageBox(g)));
}

/** A new field of `type` centred on a CSS-pixel point of a rendered page. */
export function createFieldAt(
  type: FieldType,
  page: number,
  g: PageGeometry,
  scale: number,
  screenX: number,
  screenY: number,
  existingIds: Iterable<string>,
): Field {
  const size = DEFAULT_SIZE[type];
  const width = size.w * scale;
  const height = size.h * scale;
  const rect = screenRectToPdf(g, {
    left: screenX - width / 2,
    top: screenY - height / 2,
    width,
    height,
  });
  return {
    id: newFieldId(existingIds),
    type,
    page,
    ...fitToPage(rect, g),
    required: true,
    labelEn: DEFAULT_LABELS[type].en,
    labelZh: DEFAULT_LABELS[type].zh,
    prefill: DEFAULT_PREFILL[type],
  };
}

/** Moves a field by CSS pixels in the rendered page's (rotated) frame. */
export function nudgeField(
  field: Field,
  g: PageGeometry,
  dxPx: number,
  dyPx: number,
): Field {
  const s = pdfRectToScreen(g, field);
  const moved = screenRectToPdf(g, {
    ...s,
    left: s.left + dxPx,
    top: s.top + dyPx,
  });
  return { ...field, ...fitToPage(moved, g) };
}

/** Applies a react-rnd drag/resize result (CSS pixels) to a field. */
export function placeField(
  field: Field,
  g: PageGeometry,
  left: number,
  top: number,
  width: number,
  height: number,
): Field {
  return {
    ...field,
    ...fitToPage(screenRectToPdf(g, { left, top, width, height }), g),
  };
}

export function duplicateField(
  field: Field,
  g: PageGeometry,
  scale: number,
  existingIds: Iterable<string>,
): Field {
  const offset = 12 * scale;
  return {
    ...nudgeField(field, g, offset, offset),
    id: newFieldId(existingIds),
  };
}

/** Switching type keeps custom labels but resets defaults and invalid prefills. */
export function changeType(field: Field, type: FieldType): Field {
  const old = DEFAULT_LABELS[field.type];
  const next = DEFAULT_LABELS[type];
  return {
    ...field,
    type,
    labelEn: field.labelEn === old.en ? next.en : field.labelEn,
    labelZh: field.labelZh === old.zh ? next.zh : field.labelZh,
    prefill: allowedPrefills(type).includes(field.prefill)
      ? field.prefill
      : DEFAULT_PREFILL[type],
  };
}

export function sameFields(a: Field[], b: Field[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
