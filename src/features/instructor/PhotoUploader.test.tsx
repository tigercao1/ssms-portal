import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MorePhotosUploader, PhotoUploader } from './PhotoUploader';
import { renderWithProviders } from '@/test/render';
import { fakeProfile, server } from '@/test/msw';
import { mockImagePipeline, sizedFile } from '@/test/imageMocks';
import { bodyBytes, patternBytes, sha256 } from '@/test/bytes';

const API = 'http://localhost:3000';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PhotoUploader', () => {
  it('uploads through the instructor photo routes without a remove action', async () => {
    const calls: string[] = [];
    let uploaded: { type: string | null; body: string } | undefined;
    server.use(
      http.post(`${API}/me/instructor/photo/signed-upload-url`, () => {
        calls.push('signed-upload-url');
        return HttpResponse.json({
          uploadUrl: 'http://storage.test/upload',
          token: 'tok',
          publicUrl: 'http://storage.test/photo.png',
          path: 'inst-1/photo.png',
        });
      }),
      http.put('http://storage.test/upload', async ({ request }) => {
        calls.push('put');
        uploaded = {
          type: request.headers.get('content-type'),
          body: await request.text(),
        };
        return new HttpResponse(null, { status: 200 });
      }),
      http.post(`${API}/me/instructor/photo/confirm`, () => {
        calls.push('confirm');
        return HttpResponse.json({
          ...fakeProfile,
          profilePhotoUrl: 'http://storage.test/photo.png',
        });
      }),
    );
    const { container } = renderWithProviders(
      <PhotoUploader
        profile={{
          ...fakeProfile,
          profilePhotoUrl: 'http://storage.test/old.png',
        }}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Remove photo' }),
    ).not.toBeInTheDocument();
    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['abcd'], 'me.png', { type: 'image/png' }),
    );

    await screen.findByLabelText('Upload photo');
    await vi.waitFor(() =>
      expect(calls).toEqual(['signed-upload-url', 'put', 'confirm']),
    );
    expect(uploaded).toEqual({ type: 'image/png', body: 'abcd' });
  });

  it('shows the storage error when the upload is rejected', async () => {
    server.use(
      http.post(`${API}/me/instructor/photo/signed-upload-url`, () =>
        HttpResponse.json({
          uploadUrl: 'http://storage.test/upload',
          token: 'tok',
          publicUrl: 'http://storage.test/photo.png',
          path: 'inst-1/photo.png',
        }),
      ),
      http.put('http://storage.test/upload', () =>
        HttpResponse.text('bucket full', { status: 413 }),
      ),
    );
    const { container } = renderWithProviders(
      <PhotoUploader profile={fakeProfile} />,
    );

    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['abcd'], 'me.png', { type: 'image/png' }),
    );

    expect(
      await screen.findByText(/Storage upload failed \(413\)\. bucket full/),
    ).toBeInTheDocument();
  });

  it('retries the same photo after a failed upload', async () => {
    let puts = 0;
    server.use(
      http.post(`${API}/me/instructor/photo/signed-upload-url`, () =>
        HttpResponse.json({
          uploadUrl: 'http://storage.test/upload',
          token: 'tok',
          publicUrl: 'http://storage.test/photo.png',
          path: 'inst-1/photo.png',
        }),
      ),
      http.put('http://storage.test/upload', () => {
        puts += 1;
        return HttpResponse.text('bucket full', { status: 413 });
      }),
    );
    const { container } = renderWithProviders(
      <PhotoUploader profile={fakeProfile} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const photo = new File(['abcd'], 'me.png', { type: 'image/png' });

    await userEvent.upload(input, photo);
    await screen.findByText(/Storage upload failed \(413\)/);
    expect(input.value).toBe('');
    await userEvent.upload(input, photo);

    await vi.waitFor(() => expect(puts).toBe(2));
  });

  it('opens the photo picker from a label for the file input, not a scripted click', async () => {
    const scripted = vi.spyOn(HTMLInputElement.prototype, 'click');
    renderWithProviders(<PhotoUploader profile={fakeProfile} />);
    const input = screen.getByLabelText('Upload photo');
    const opened = vi.fn();
    input.addEventListener('click', opened);
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(input).toHaveClass('sr-only');

    await userEvent.click(screen.getByText('Upload photo'));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(scripted).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file before uploading', async () => {
    const { container } = renderWithProviders(
      <PhotoUploader profile={fakeProfile} />,
    );

    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['abcd'], 'me.gif', { type: 'image/gif' }),
      { applyAccept: false },
    );

    expect(
      await screen.findByText('Use a JPEG, PNG or WebP image.'),
    ).toBeInTheDocument();
  });

  it('accepts a large phone photo and uploads it resized', async () => {
    mockImagePipeline({ width: 4032, height: 3024, outputBytes: 800_000 });
    let ticket: unknown;
    let uploaded: Uint8Array | undefined;
    server.use(
      http.post(
        `${API}/me/instructor/photo/signed-upload-url`,
        async ({ request }) => {
          ticket = await request.json();
          return HttpResponse.json({
            uploadUrl: 'http://storage.test/upload',
            token: 'tok',
            publicUrl: 'http://storage.test/photo.jpg',
            path: 'inst-1/photo.jpg',
          });
        },
      ),
      http.put('http://storage.test/upload', async ({ request }) => {
        uploaded = await bodyBytes(request);
        return new HttpResponse(null, { status: 200 });
      }),
      http.post(`${API}/me/instructor/photo/confirm`, () =>
        HttpResponse.json(fakeProfile),
      ),
    );
    const { container } = renderWithProviders(
      <PhotoUploader profile={fakeProfile} />,
    );

    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      sizedFile('big.jpg', 'image/jpeg', 12 * 1024 * 1024),
    );

    await vi.waitFor(() =>
      expect(ticket).toEqual({
        contentType: 'image/jpeg',
        contentLength: 800_000,
      }),
    );
    const expected = sha256(patternBytes(800_000));
    await vi.waitFor(() => expect(uploaded && sha256(uploaded)).toBe(expected));
    expect(screen.queryByText(/5 MB or smaller/)).not.toBeInTheDocument();
  });

  it('shows the size error when a photo is still too large after resizing', async () => {
    mockImagePipeline({
      width: 2000,
      height: 2000,
      outputBytes: 6 * 1024 * 1024,
    });
    const { container } = renderWithProviders(
      <PhotoUploader profile={fakeProfile} />,
    );

    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      sizedFile('huge.jpg', 'image/jpeg', 30 * 1024 * 1024),
    );

    expect(
      await screen.findByText('Image must be 5 MB or smaller.'),
    ).toBeInTheDocument();
  });
});

describe('MorePhotosUploader', () => {
  function serveSlotRoutes() {
    const bodies: { route: string; body: unknown }[] = [];
    const uploads: Uint8Array[] = [];
    const deletes: string[] = [];
    server.use(
      http.post(
        `${API}/me/instructor/photo/signed-upload-url`,
        async ({ request }) => {
          bodies.push({
            route: 'signed-upload-url',
            body: await request.json(),
          });
          return HttpResponse.json({
            uploadUrl: 'http://storage.test/upload',
            token: 'tok',
            publicUrl: 'http://storage.test/photo-2.png',
            path: 'inst-1/photo-2.png',
          });
        },
      ),
      http.put('http://storage.test/upload', async ({ request }) => {
        uploads.push(await bodyBytes(request));
        return new HttpResponse(null, { status: 200 });
      }),
      http.post(`${API}/me/instructor/photo/confirm`, async ({ request }) => {
        bodies.push({ route: 'confirm', body: await request.json() });
        return HttpResponse.json({
          ...fakeProfile,
          photo2Url: 'http://storage.test/photo-2.png',
        });
      }),
      http.delete(`${API}/me/instructor/photo/:slot`, ({ params }) => {
        deletes.push(String(params.slot));
        return HttpResponse.json({ ...fakeProfile, photo3Url: null });
      }),
    );
    return { bodies, uploads, deletes };
  }

  it('shows two labelled photo slots under a More photos heading', () => {
    renderWithProviders(<MorePhotosUploader profile={fakeProfile} />);
    expect(
      screen.getByRole('heading', { name: 'More photos' }),
    ).toBeInTheDocument();
    for (const name of ['Photo 2', 'Photo 3']) {
      const group = screen.getByRole('group', { name });
      expect(within(group).getByLabelText('Upload photo')).toBeInTheDocument();
      expect(
        within(group).queryByRole('button', { name: 'Remove photo' }),
      ).not.toBeInTheDocument();
    }
  });

  it('uploads slot 2 through the shared resize path with its slot', async () => {
    const mock = mockImagePipeline({
      width: 4032,
      height: 3024,
      outputBytes: 700_000,
    });
    const { bodies, uploads } = serveSlotRoutes();
    renderWithProviders(<MorePhotosUploader profile={fakeProfile} />);

    const group = screen.getByRole('group', { name: 'Photo 2' });
    await userEvent.upload(
      group.querySelector('input[type="file"]') as HTMLInputElement,
      sizedFile('big.jpg', 'image/jpeg', 12 * 1024 * 1024),
    );

    await vi.waitFor(() =>
      expect(bodies).toEqual([
        {
          route: 'signed-upload-url',
          body: { contentType: 'image/jpeg', contentLength: 700_000, slot: 2 },
        },
        { route: 'confirm', body: { contentType: 'image/jpeg', slot: 2 } },
      ]),
    );
    expect(uploads.map(sha256)).toEqual([sha256(patternBytes(700_000))]);
    expect(mock.drawn).toEqual([{ width: 2000, height: 1500 }]);
  });

  it('offers replace and remove for a filled slot and removes it by slot', async () => {
    const { deletes } = serveSlotRoutes();
    renderWithProviders(
      <MorePhotosUploader
        profile={{ ...fakeProfile, photo3Url: 'http://storage.test/p3.png' }}
      />,
    );

    const group = screen.getByRole('group', { name: 'Photo 3' });
    expect(within(group).getByRole('img')).toHaveAttribute(
      'src',
      'http://storage.test/p3.png',
    );
    expect(within(group).getByLabelText('Replace photo')).toBeInTheDocument();
    await userEvent.click(
      within(group).getByRole('button', { name: 'Remove photo' }),
    );
    await vi.waitFor(() => expect(deletes).toEqual(['3']));
  });

  it('shows an error when removing a slot fails', async () => {
    server.use(
      http.delete(
        `${API}/me/instructor/photo/:slot`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderWithProviders(
      <MorePhotosUploader
        profile={{ ...fakeProfile, photo2Url: 'http://storage.test/p2.png' }}
      />,
    );
    const group = screen.getByRole('group', { name: 'Photo 2' });
    await userEvent.click(
      within(group).getByRole('button', { name: 'Remove photo' }),
    );
    expect(
      await within(group).findByText('Something went wrong.'),
    ).toBeInTheDocument();
  });

  it('shows Chinese slot labels under zh-CN', () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(
      <MorePhotosUploader
        profile={{ ...fakeProfile, photo2Url: 'http://storage.test/p2.png' }}
      />,
    );
    expect(
      screen.getByRole('heading', { name: '更多照片' }),
    ).toBeInTheDocument();
    const photo2 = screen.getByRole('group', { name: '照片 2' });
    expect(within(photo2).getByLabelText('更换照片')).toBeInTheDocument();
    expect(
      within(photo2).getByRole('button', { name: '移除照片' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: '照片 3' })).getByLabelText(
        '上传照片',
      ),
    ).toBeInTheDocument();
  });
});
