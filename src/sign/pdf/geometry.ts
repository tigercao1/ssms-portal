export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_OUTPUT_RATIO = 2;
export const MAX_CANVAS_PIXELS = 4_000_000;
const MAX_TEXT_SIZE_PT = 12;
const TEXT_HEIGHT_SHARE = 0.7;
const MAX_TEXT_PAD_PT = 2;

export function placementToPixels(
  transform: readonly number[],
  rect: PdfRect,
): PixelRect {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = transform;
  const toScreen = (x: number, y: number) => [
    a * x + c * y + e,
    b * x + d * y + f,
  ];
  const [x0 = 0, y0 = 0] = toScreen(rect.x, rect.y);
  const [x1 = 0, y1 = 0] = toScreen(rect.x + rect.w, rect.y + rect.h);
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

export function outputRatio(
  width: number,
  height: number,
  devicePixelRatio: number,
): number {
  const ratio = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_OUTPUT_RATIO);
  const area = width * height;
  if (area <= 0 || area * ratio * ratio <= MAX_CANVAS_PIXELS) return ratio;
  return Math.sqrt(MAX_CANVAS_PIXELS / area);
}

export function fitText(
  box: PixelRect,
  pointsToPixels: number,
  widthAtOnePixel: number,
): { fontSize: number; padding: number } {
  const padding = Math.min(MAX_TEXT_PAD_PT * pointsToPixels, box.width / 10);
  const maxSize = Math.min(
    MAX_TEXT_SIZE_PT * pointsToPixels,
    box.height * TEXT_HEIGHT_SHARE,
  );
  const available = box.width - 2 * padding;
  const fontSize =
    widthAtOnePixel * maxSize > available
      ? Math.max(pointsToPixels, available / widthAtOnePixel)
      : maxSize;
  return { fontSize, padding };
}
