import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SIGNATURE_MAX_BYTES,
  dataUrlBytes,
  exportSignaturePng,
} from './signatureExport';

function pngDataUrl(bytes: number) {
  return `data:image/png;base64,${'A'.repeat(Math.ceil(bytes / 3) * 4)}`;
}

function stubEncoder(bytesFor: (width: number, height: number) => number) {
  const drawn: Array<[number, number]> = [];
  const getContext = function (this: HTMLCanvasElement) {
    const { width, height } = this;
    return { drawImage: () => drawn.push([width, height]) };
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    getContext as unknown as HTMLCanvasElement['getContext'],
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    function (this: HTMLCanvasElement) {
      return pngDataUrl(bytesFor(this.width, this.height));
    },
  );
  return drawn;
}

function dpr3LandscapeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 1584;
  canvas.height = 528;
  return canvas;
}

const BYTES_PER_PIXEL_OF_REVIEW_STROKE = 213_791 / (1584 * 528);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signature PNG export', () => {
  it('downscales the 3x landscape canvas that exported 213,791 bytes to fit 1000x600 and the byte budget', () => {
    const drawn = stubEncoder(
      (width, height) => width * height * BYTES_PER_PIXEL_OF_REVIEW_STROKE,
    );

    const png = exportSignaturePng(dpr3LandscapeCanvas());

    expect(drawn).toEqual([[1000, 333]]);
    expect(dataUrlBytes(png!)).toBeLessThanOrEqual(SIGNATURE_MAX_BYTES);
  });

  it('re-encodes smaller when the first export is still over the byte budget', () => {
    const drawn = stubEncoder((width, height) => width * height * 0.5);

    const png = exportSignaturePng(dpr3LandscapeCanvas());

    expect(drawn.length).toBeGreaterThan(1);
    expect(drawn[1]![0]).toBeLessThan(1000);
    expect(dataUrlBytes(png!)).toBeLessThanOrEqual(SIGNATURE_MAX_BYTES);
  });

  it('gives up when no smaller export fits', () => {
    stubEncoder(() => SIGNATURE_MAX_BYTES + 1);

    expect(exportSignaturePng(dpr3LandscapeCanvas())).toBeNull();
  });

  it('counts decoded bytes of a base64 data URL', () => {
    expect(dataUrlBytes('data:image/png;base64,iVBORw0KGgo=')).toBe(8);
  });
});
