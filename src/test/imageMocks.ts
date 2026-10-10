import { vi } from 'vitest';

export interface ImageMock {
  drawn: { width: number; height: number }[];
  encoded: { type?: string; quality?: unknown }[];
}

export function mockImagePipeline({
  width,
  height,
  outputBytes,
  outputType = 'image/jpeg',
  decodeFails = false,
}: {
  width: number;
  height: number;
  outputBytes: number;
  outputType?: string;
  decodeFails?: boolean;
}): ImageMock {
  const mock: ImageMock = { drawn: [], encoded: [] };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (decodeFails) throw new Error('not an image');
      return { width, height, close: vi.fn() };
    }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: (
          _img: unknown,
          _x: number,
          _y: number,
          w: number,
          h: number,
        ) => mock.drawn.push({ width: w, height: h }),
      }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb,
    type,
    quality,
  ) {
    mock.encoded.push({ type, quality });
    cb(new Blob([new Uint8Array(outputBytes)], { type: outputType }));
  });
  return mock;
}

export function sizedFile(name: string, type: string, size: number): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}
