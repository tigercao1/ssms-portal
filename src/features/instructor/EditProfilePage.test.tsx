import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { EditProfilePage } from './EditProfilePage';
import { renderWithProviders } from '@/test/render';
import { fakeProfile, server } from '@/test/msw';
import type { InstructorProfile, UpdateProfileBody } from '@/lib/types';

const API = 'http://localhost:3000';

function capturePatches() {
  const bodies: UpdateProfileBody[] = [];
  server.use(
    http.patch(`${API}/me/instructor`, async ({ request }) => {
      const body = (await request.json()) as UpdateProfileBody;
      bodies.push(body);
      return HttpResponse.json({ ...fakeProfile, ...body });
    }),
  );
  return bodies;
}

async function minAgeInput() {
  return screen.findByRole('spinbutton', { name: /Minimum student age/ });
}

describe('EditProfilePage (W2.2)', () => {
  it('hydrates the form from the fetched profile', async () => {
    renderWithProviders(<EditProfilePage />);
    // display name input seeded from the API profile
    expect(await screen.findByDisplayValue('Jane Snow')).toBeInTheDocument();
    // section headings render
    expect(screen.getByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('Teaching')).toBeInTheDocument();
    // a teaching location option from /reference is offered
    expect(
      screen.getAllByRole('button', { name: 'Whistler' }).length,
    ).toBeGreaterThan(0);
  });

  it('prefills the minimum student age and sends it in the PATCH body', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, minStudentAge: 7 }),
      ),
    );
    const bodies = capturePatches();
    renderWithProviders(<EditProfilePage />);
    const input = await minAgeInput();
    expect(input).toHaveValue(7);
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '18');
    expect(input).toHaveAttribute('step', '1');

    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(bodies).toEqual([expect.objectContaining({ minStudentAge: 12 })]),
    );
  });

  it.each([
    ['19', 'Enter a whole number from 0 to 18.'],
    ['-1', 'Enter a whole number from 0 to 18.'],
    ['2.5', 'Enter a whole number from 0 to 18.'],
    ['', 'This field is required.'],
  ])(
    'blocks submit when the minimum student age is %p',
    async (value, message) => {
      const bodies = capturePatches();
      renderWithProviders(<EditProfilePage />);
      const input = await minAgeInput();
      await userEvent.clear(input);
      if (value) await userEvent.type(input, value);
      expect(input).toBeInvalid();
      await userEvent.click(
        screen.getByRole('button', { name: 'Save changes' }),
      );
      fireEvent.submit(input.closest('form')!);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(bodies).toHaveLength(0);
    },
  );

  it('defaults the minimum student age to 5 when the profile lacks it', async () => {
    const legacy: Partial<InstructorProfile> = { ...fakeProfile };
    delete legacy.minStudentAge;
    server.use(
      http.get(`${API}/me/instructor`, () => HttpResponse.json(legacy)),
    );
    const bodies = capturePatches();
    renderWithProviders(<EditProfilePage />);
    expect(await minAgeInput()).toHaveValue(5);

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(bodies).toEqual([expect.objectContaining({ minStudentAge: 5 })]),
    );
  });
});
