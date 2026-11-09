import { describe, expect, it } from 'vitest';
import { viewportGeometry } from '@/features/documents/pdf/transforms';
import {
  MAX_CANVAS_PIXELS,
  fitText,
  outputRatio,
  placementToPixels,
} from './geometry';

const LETTER_HEIGHT = 792;

function uprightTransform(scale: number, height = LETTER_HEIGHT) {
  return [scale, 0, 0, -scale, 0, height * scale];
}

describe('placement to pixel mapping', () => {
  it('maps a bottom-left point rect to a top-left pixel box at the page scale', () => {
    const scale = 358 / 612;
    const box = placementToPixels(uprightTransform(scale), {
      x: 56,
      y: 92.5,
      w: 250,
      h: 17.8,
    });

    expect(box.left).toBeCloseTo(56 * scale);
    expect(box.top).toBeCloseTo((LETTER_HEIGHT - 92.5 - 17.8) * scale);
    expect(box.width).toBeCloseTo(250 * scale);
    expect(box.height).toBeCloseTo(17.8 * scale);
  });

  it('puts a rect at the page origin at the bottom-left corner of the page', () => {
    expect(
      placementToPixels(uprightTransform(1), { x: 0, y: 0, w: 100, h: 20 }),
    ).toEqual({ left: 0, top: 772, width: 100, height: 20 });
  });

  it('honours a page box whose origin is not zero', () => {
    const transform = [1, 0, 0, -1, -10, 800];
    expect(placementToPixels(transform, { x: 10, y: 8, w: 50, h: 12 })).toEqual(
      { left: 0, top: 780, width: 50, height: 12 },
    );
  });

  it('follows a page rotated by 90 degrees', () => {
    const transform = [0, 1, 1, 0, 0, 0];
    expect(
      placementToPixels(transform, { x: 100, y: 40, w: 60, h: 10 }),
    ).toEqual({ left: 40, top: 100, width: 10, height: 60 });
  });
});

describe('placement to pixel mapping on the page boxes the API reports', () => {
  it('places a field on an offset A4 page rotated by 90 degrees where pdf.js draws it', () => {
    const page = { width: 595, height: 842, rotate: 90, x: 10, y: 20 };
    const scale = 358 / page.height;
    const { transform, width, height } = viewportGeometry({
      viewBox: [page.x, page.y, page.x + page.width, page.y + page.height],
      scale,
      rotation: page.rotate,
    });

    const box = placementToPixels(transform, {
      x: 10 + 56,
      y: 20 + 100,
      w: 250,
      h: 20,
    });

    expect(width).toBeCloseTo(358);
    expect(height).toBeCloseTo(595 * scale);
    expect(box.left).toBeCloseTo(100 * scale);
    expect(box.top).toBeCloseTo(56 * scale);
    expect(box.width).toBeCloseTo(20 * scale);
    expect(box.height).toBeCloseTo(250 * scale);
  });

  it('places a field on an upright page whose box starts away from the origin', () => {
    const { transform } = viewportGeometry({
      viewBox: [36, 48, 648, 840],
      scale: 1,
      rotation: 0,
    });

    expect(
      placementToPixels(transform, { x: 36, y: 48, w: 100, h: 20 }),
    ).toEqual({ left: 0, top: 772, width: 100, height: 20 });
  });
});

describe('page render resolution', () => {
  it('uses the device pixel ratio up to 2', () => {
    expect(outputRatio(358, 463, 1)).toBe(1);
    expect(outputRatio(358, 463, 2)).toBe(2);
    expect(outputRatio(358, 463, 3)).toBe(2);
    expect(outputRatio(358, 463, 0)).toBe(1);
  });

  it('lowers the ratio for very large pages to stay under the pixel budget', () => {
    const ratio = outputRatio(2000, 2600, 2);
    expect(ratio).toBeLessThan(1);
    expect(2000 * 2600 * ratio * ratio).toBeCloseTo(MAX_CANVAS_PIXELS);
  });
});

describe('text fitting', () => {
  const box = { left: 0, top: 0, width: 250, height: 12.4 };

  it('uses up to 12 pt or 70% of the box height, like the signed copy', () => {
    expect(fitText(box, 1, 0.3).fontSize).toBeCloseTo(12.4 * 0.7);
    expect(fitText({ ...box, height: 30 }, 1, 0.3).fontSize).toBe(12);
    expect(fitText({ ...box, height: 30 }, 2, 0.3).fontSize).toBe(21);
  });

  it('shrinks long text to fit the box width after the padding', () => {
    const { fontSize, padding } = fitText(box, 1, 60);
    expect(padding).toBe(2);
    expect(fontSize * 60).toBeCloseTo(250 - 4);
  });
});
