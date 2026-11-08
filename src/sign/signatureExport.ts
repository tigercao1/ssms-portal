export const SIGNATURE_MAX_WIDTH = 1000;
export const SIGNATURE_MAX_HEIGHT = 600;
export const SIGNATURE_MAX_BYTES = 150 * 1024;

const SHRINK_STEP = 0.7;
const MAX_ATTEMPTS = 4;

export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function exportSignaturePng(source: HTMLCanvasElement): string | null {
  let scale = Math.min(
    1,
    SIGNATURE_MAX_WIDTH / source.width,
    SIGNATURE_MAX_HEIGHT / source.height,
  );
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const target = document.createElement('canvas');
    target.width = Math.max(1, Math.round(source.width * scale));
    target.height = Math.max(1, Math.round(source.height * scale));
    target
      .getContext('2d')
      ?.drawImage(source, 0, 0, target.width, target.height);
    const png = target.toDataURL('image/png');
    if (dataUrlBytes(png) <= SIGNATURE_MAX_BYTES) return png;
    scale *= SHRINK_STEP;
  }
  return null;
}
