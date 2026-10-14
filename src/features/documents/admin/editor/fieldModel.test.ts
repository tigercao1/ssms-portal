import { describe, expect, it } from 'vitest';
import { pdfPageBox, viewportGeometry } from '../../pdf/transforms';
import { validateFields } from '../../api/handlers';
import { fakeField, fakeTemplate } from '../../api/fixtures';
import {
  allowedPrefills,
  changeType,
  createFieldAt,
  duplicateField,
  fitToPage,
  newFieldId,
  nudgeField,
  placeField,
  sameFields,
  scaleOf,
} from './fieldModel';

const upright = viewportGeometry({
  viewBox: [0, 0, 612, 792],
  scale: 2,
  rotation: 0,
});
const rotated = viewportGeometry({
  viewBox: [0, 0, 612, 792],
  scale: 1,
  rotation: 90,
});

describe('createFieldAt', () => {
  it('centres a default-size field on the drop point, in PDF points', () => {
    const f = createFieldAt('signature', 1, upright, 2, 612, 792, []);
    expect(f).toMatchObject({
      type: 'signature',
      page: 1,
      x: 306 - 90,
      y: 396 - 18,
      w: 180,
      h: 36,
      labelEn: 'Signature',
      labelZh: '签名',
      required: true,
      prefill: null,
    });
    expect(f.id).toMatch(/^f_[a-z0-9]+$/);
  });

  it('keeps the field visually horizontal on a rotated page', () => {
    const f = createFieldAt('full_name', 1, rotated, 1, 400, 300, []);
    expect(f.w).toBe(22);
    expect(f.h).toBe(200);
    expect(f.prefill).toBe('full_name');
  });

  it('pulls a drop near the edge back onto the page', () => {
    const f = createFieldAt('date', 1, upright, 2, 0, 0, []);
    expect(f.x).toBe(0);
    expect(f.y + f.h).toBe(792);
    expect(createFieldAt('date', 1, upright, 2, 1, 1, []).prefill).toBe(
      'date_signed',
    );
  });
});

describe('moving and resizing', () => {
  const field = fakeField();

  it('nudges in the rendered frame', () => {
    expect(nudgeField(field, upright, 20, 0)).toMatchObject({ x: 82, y: 120 });
    expect(nudgeField(field, upright, 0, -20)).toMatchObject({ x: 72, y: 130 });
    expect(nudgeField(field, rotated, 0, -10)).toMatchObject({ x: 62, y: 120 });
  });

  it('applies react-rnd pixel rects', () => {
    expect(placeField(field, upright, 200, 1000, 400, 100)).toEqual({
      ...field,
      x: 100,
      y: 242,
      w: 200,
      h: 50,
    });
  });

  it('enforces a minimum size and the page bounds', () => {
    expect(fitToPage({ x: 700, y: -3, w: 2, h: 2 }, upright)).toEqual({
      x: 604,
      y: 0,
      w: 8,
      h: 8,
    });
  });

  it.each([0, 90, 180, 270] as const)(
    'clamps to the same visible box the API checks on an offset CropBox (rotate %i)',
    (rotate) => {
      const page = { x: 36, y: 54.5, width: 520, height: 700, rotate };
      const g = viewportGeometry({
        viewBox: [page.x, page.y, page.x + page.width, page.y + page.height],
        scale: 1.37,
        rotation: rotate,
      });
      const box = pdfPageBox(g);
      [page.x, page.y, page.x + page.width, page.y + page.height].forEach(
        (v, i) => expect(box[i]).toBeCloseTo(v, 6),
      );
      const template = fakeTemplate({ pages: [page] });
      const corners = [
        { x: -500, y: -500, w: 40, h: 20 },
        { x: 9000, y: 9000, w: 40, h: 20 },
        { x: 0, y: 0, w: 9000, h: 9000 },
      ].map((r) => fakeField({ id: `f${r.x}`, ...fitToPage(r, g) }));
      expect(validateFields(template, corners)).toBeNull();
      expect(corners[0]).toMatchObject({ x: 36, y: 54.5 });
      expect(corners[2]).toMatchObject({ x: 36, y: 54.5, w: 520, h: 700 });
    },
  );

  it('duplicates with a new id, offset down and right', () => {
    const copy = duplicateField(field, upright, 2, [field.id]);
    expect(copy.id).not.toBe(field.id);
    expect(copy).toMatchObject({ x: 84, y: 108, w: 180, h: 36 });
  });
});

describe('changeType', () => {
  it('swaps default labels and fixes the prefill', () => {
    const f = changeType(
      fakeField({
        type: 'text',
        labelEn: 'Text',
        labelZh: '文本',
        prefill: 'email',
      }),
      'date',
    );
    expect(f).toMatchObject({
      type: 'date',
      labelEn: 'Date',
      labelZh: '日期',
      prefill: 'date_signed',
    });
  });

  it('keeps custom labels and allowed prefills', () => {
    const f = changeType(
      fakeField({
        type: 'full_name',
        labelEn: 'Legal name',
        labelZh: null,
        prefill: 'full_name',
      }),
      'text',
    );
    expect(f).toMatchObject({
      labelEn: 'Legal name',
      labelZh: null,
      prefill: 'full_name',
    });
  });
});

describe('helpers', () => {
  it('lists prefills per type', () => {
    expect(allowedPrefills('signature')).toEqual([null]);
    expect(allowedPrefills('text')).toEqual([null, 'full_name', 'email']);
  });

  it('makes unique ids and compares lists', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(newFieldId(ids));
    expect(ids.size).toBe(50);
    expect(sameFields([fakeField()], [fakeField()])).toBe(true);
    expect(sameFields([fakeField()], [fakeField({ x: 1 })])).toBe(false);
  });

  it('reads the scale off a geometry', () => {
    expect(scaleOf(upright)).toBe(2);
    expect(scaleOf(rotated)).toBe(1);
  });
});
