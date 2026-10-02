import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { PhotoUploader } from './PhotoUploader';
import { renderWithProviders } from '@/test/render';
import { fakeProfile, server } from '@/test/msw';

const API = 'http://localhost:3000';

describe('PhotoUploader', () => {
  it('uploads through the instructor photo routes without a remove action', async () => {
    const calls: string[] = [];
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
      http.put('http://storage.test/upload', () => {
        calls.push('put');
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

    await screen.findByRole('button', { name: 'Upload photo' });
    await vi.waitFor(() =>
      expect(calls).toEqual(['signed-upload-url', 'put', 'confirm']),
    );
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
});
