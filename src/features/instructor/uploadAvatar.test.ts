import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { uploadAvatar } from './api';
import { fakeProfile, server } from '@/test/msw';
import { mockImagePipeline, sizedFile } from '@/test/imageMocks';
import { bodyBytes, patternBytes, sha256 } from '@/test/bytes';

const API = 'http://localhost:3000';
const MB = 1024 * 1024;

interface Captured {
  ticket?: { contentType: string; contentLength: number };
  putType?: string | null;
  putBody?: Uint8Array;
  confirm?: { contentType: string };
}

function captureUpload(): Captured {
  const captured: Captured = {};
  server.use(
    http.post(
      `${API}/me/instructor/photo/signed-upload-url`,
      async ({ request }) => {
        captured.ticket = (await request.json()) as Captured['ticket'];
        return HttpResponse.json({
          uploadUrl: 'http://storage.test/upload',
          token: 'tok',
          publicUrl: 'http://storage.test/photo.jpg',
          path: 'inst-1/photo.jpg',
        });
      },
    ),
    http.put('http://storage.test/upload', async ({ request }) => {
      captured.putType = request.headers.get('content-type');
      captured.putBody = await bodyBytes(request);
      return new HttpResponse(null, { status: 200 });
    }),
    http.post(`${API}/me/instructor/photo/confirm`, async ({ request }) => {
      captured.confirm = (await request.json()) as Captured['confirm'];
      return HttpResponse.json(fakeProfile);
    }),
  );
  return captured;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('uploadAvatar resizing', () => {
  it('accepts a 12 MB phone photo and uploads the resized JPEG', async () => {
    const mock = mockImagePipeline({
      width: 4032,
      height: 3024,
      outputBytes: 900_000,
    });
    const captured = captureUpload();

    await uploadAvatar(
      sizedFile('big.jpg', 'image/jpeg', 12 * MB),
      '/me/instructor/photo',
    );

    expect(mock.drawn).toEqual([{ width: 2000, height: 1500 }]);
    expect(captured.ticket).toEqual({
      contentType: 'image/jpeg',
      contentLength: 900_000,
    });
    expect(captured.putType).toBe('image/jpeg');
    expect(sha256(captured.putBody!)).toBe(sha256(patternBytes(900_000)));
    expect(captured.confirm).toEqual({ contentType: 'image/jpeg' });
  });

  it('sends image/jpeg for a resized PNG', async () => {
    mockImagePipeline({ width: 3000, height: 3000, outputBytes: 500 });
    const captured = captureUpload();

    await uploadAvatar(
      new File([new Uint8Array(4000)], 'a.png', { type: 'image/png' }),
      '/me/instructor/photo',
    );

    expect(captured.ticket).toEqual({
      contentType: 'image/jpeg',
      contentLength: 500,
    });
    expect(captured.putType).toBe('image/jpeg');
    expect(captured.putBody).toEqual(patternBytes(500));
  });

  it('uploads the original when resizing does not make it smaller', async () => {
    mockImagePipeline({ width: 400, height: 400, outputBytes: 9000 });
    const captured = captureUpload();

    await uploadAvatar(
      new File([patternBytes(3000)], 'a.webp', { type: 'image/webp' }),
      '/me/instructor/photo',
    );

    expect(captured.ticket).toEqual({
      contentType: 'image/webp',
      contentLength: 3000,
    });
    expect(captured.putType).toBe('image/webp');
    expect(captured.putBody).toEqual(patternBytes(3000));
    expect(captured.confirm).toEqual({ contentType: 'image/webp' });
  });

  it('uploads the original when the browser cannot resize', async () => {
    mockImagePipeline({
      width: 1,
      height: 1,
      outputBytes: 1,
      decodeFails: true,
    });
    const captured = captureUpload();

    await uploadAvatar(
      new File([patternBytes(100)], 'a.png', { type: 'image/png' }),
      '/me/instructor/photo',
    );

    expect(captured.putType).toBe('image/png');
    expect(captured.putBody).toEqual(patternBytes(100));
  });

  it('rejects a photo that is still over 5 MB after resizing', async () => {
    mockImagePipeline({ width: 2000, height: 2000, outputBytes: 6 * MB });
    const captured = captureUpload();

    await expect(
      uploadAvatar(
        sizedFile('huge.jpg', 'image/jpeg', 20 * MB),
        '/me/instructor/photo',
      ),
    ).rejects.toThrow('Image must be 5 MB or smaller.');
    expect(captured.ticket).toBeUndefined();
  });

  it('rejects an oversized file that cannot be decoded', async () => {
    mockImagePipeline({
      width: 1,
      height: 1,
      outputBytes: 1,
      decodeFails: true,
    });

    await expect(
      uploadAvatar(
        sizedFile('huge.jpg', 'image/jpeg', 12 * MB),
        '/me/instructor/photo',
      ),
    ).rejects.toThrow('Image must be 5 MB or smaller.');
  });

  it('rejects a non-image without uploading', async () => {
    const captured = captureUpload();

    await expect(
      uploadAvatar(
        new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }),
        '/me/instructor/photo',
      ),
    ).rejects.toThrow('Use a JPEG, PNG or WebP image.');
    expect(captured.ticket).toBeUndefined();
  });
});
