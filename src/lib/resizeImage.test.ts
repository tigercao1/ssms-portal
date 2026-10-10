import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitWithin, resizeImage } from './resizeImage';
import { mockImagePipeline } from '@/test/imageMocks';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fitWithin', () => {
  it('caps the longest side at 2000 px and keeps the aspect ratio', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(6000, 6000)).toEqual({ width: 2000, height: 2000 });
  });

  it('never upscales', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(2000, 10)).toEqual({ width: 2000, height: 10 });
  });
});

describe('resizeImage', () => {
  it('draws a large photo at the capped size and encodes JPEG at 0.85', async () => {
    const mock = mockImagePipeline({
      width: 4000,
      height: 3000,
      outputBytes: 10,
    });
    const out = await resizeImage(new Blob(['x'], { type: 'image/png' }));
    expect(mock.drawn).toEqual([{ width: 2000, height: 1500 }]);
    expect(mock.encoded).toEqual([{ type: 'image/jpeg', quality: 0.85 }]);
    expect(out.type).toBe('image/jpeg');
    expect(out.size).toBe(10);
  });

  it('keeps a small photo at its own size', async () => {
    const mock = mockImagePipeline({
      width: 640,
      height: 480,
      outputBytes: 10,
    });
    await resizeImage(new Blob(['x'], { type: 'image/jpeg' }));
    expect(mock.drawn).toEqual([{ width: 640, height: 480 }]);
  });

  it('asks the browser to honour EXIF orientation', async () => {
    mockImagePipeline({ width: 10, height: 10, outputBytes: 1 });
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await resizeImage(blob);
    expect(createImageBitmap).toHaveBeenCalledWith(blob, {
      imageOrientation: 'from-image',
    });
  });

  it('rejects when the file cannot be decoded', async () => {
    mockImagePipeline({
      width: 1,
      height: 1,
      outputBytes: 1,
      decodeFails: true,
    });
    await expect(resizeImage(new Blob(['x']))).rejects.toThrow();
  });

  it('rejects when the browser cannot encode JPEG', async () => {
    mockImagePipeline({
      width: 10,
      height: 10,
      outputBytes: 1,
      outputType: 'image/png',
    });
    await expect(resizeImage(new Blob(['x']))).rejects.toThrow(/encoding/);
  });

  it('rejects when no 2D context is available', async () => {
    mockImagePipeline({ width: 10, height: 10, outputBytes: 1 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(resizeImage(new Blob(['x']))).rejects.toThrow(/context/);
  });
});
