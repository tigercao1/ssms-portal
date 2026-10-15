import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

  it('no longer sends the bios from the main Save', async () => {
    const bodies = capturePatches();
    renderWithProviders(<EditProfilePage />);
    await minAgeInput();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty('bioEn');
    expect(bodies[0]).not.toHaveProperty('bioZh');
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

describe('EditProfilePage machine-translation badge', () => {
  it('flags the machine-translated bio and explains that editing replaces it', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({
          ...fakeProfile,
          bioZh: '资深教练。',
          bioZhMachineTranslated: true,
          bioZhTranslatedBy: 'gemini-2.5-flash',
        }),
      ),
    );
    renderWithProviders(<EditProfilePage />);
    expect(await screen.findByText('资深教练。')).toBeInTheDocument();
    expect(screen.getAllByText('Translated by gemini-2.5-flash')).toHaveLength(1);
    expect(
      screen.getByText(/Editing this text replaces the machine translation/),
    ).toBeInTheDocument();
  });

  it('shows no badge or hint for human-written bios', async () => {
    renderWithProviders(<EditProfilePage />);
    expect(await screen.findByDisplayValue('Jane Snow')).toBeInTheDocument();
    expect(screen.queryByText(/Translated by/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/replaces the machine translation/),
    ).not.toBeInTheDocument();
  });
});

describe('EditProfilePage more photos', () => {
  it('shows photo slots 2 and 3 and updates a slot after upload', async () => {
    const confirms: unknown[] = [];
    const uploads: string[] = [];
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({
          ...fakeProfile,
          photo2Url: 'http://storage.test/p2.png',
          photo3Url: null,
        }),
      ),
      http.post(`${API}/me/instructor/photo/signed-upload-url`, () =>
        HttpResponse.json({
          uploadUrl: 'http://storage.test/upload',
          token: 'tok',
          publicUrl: 'http://storage.test/p3.png',
          path: 'inst-1/photo-3.png',
        }),
      ),
      http.put('http://storage.test/upload', async ({ request }) => {
        uploads.push(await request.text());
        return new HttpResponse(null, { status: 200 });
      }),
      http.post(`${API}/me/instructor/photo/confirm`, async ({ request }) => {
        confirms.push(await request.json());
        return HttpResponse.json({
          ...fakeProfile,
          photo2Url: 'http://storage.test/p2.png',
          photo3Url: 'http://storage.test/p3.png',
        });
      }),
    );
    renderWithProviders(<EditProfilePage />);

    expect(
      await screen.findByRole('heading', { name: 'More photos' }),
    ).toBeInTheDocument();
    const photo2 = screen.getByRole('group', { name: 'Photo 2' });
    expect(within(photo2).getByRole('img')).toHaveAttribute(
      'src',
      'http://storage.test/p2.png',
    );
    const photo3 = screen.getByRole('group', { name: 'Photo 3' });
    expect(within(photo3).queryByRole('img')).not.toBeInTheDocument();

    await userEvent.upload(
      photo3.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['abcd'], 'p3.png', { type: 'image/png' }),
    );

    expect(await within(photo3).findByRole('img')).toHaveAttribute(
      'src',
      'http://storage.test/p3.png',
    );
    expect(uploads).toEqual(['abcd']);
    expect(confirms).toEqual([{ contentType: 'image/png', slot: 3 }]);
    expect(screen.getByDisplayValue('Jane Snow')).toBeInTheDocument();
  });

  it('refetches the profile when a slot delete returns no body', async () => {
    let photo2Url: string | null = 'http://storage.test/p2.png';
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, photo2Url }),
      ),
      http.delete(`${API}/me/instructor/photo/2`, () => {
        photo2Url = null;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<EditProfilePage />);

    const photo2 = await screen.findByRole('group', { name: 'Photo 2' });
    await userEvent.click(
      within(photo2).getByRole('button', { name: 'Remove photo' }),
    );
    await waitFor(() =>
      expect(within(photo2).queryByRole('img')).not.toBeInTheDocument(),
    );
  });
});

describe('EditProfilePage legal name', () => {
  function serveNames(firstName: string | null, lastName: string | null) {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, firstName, lastName }),
      ),
    );
  }

  async function nameInputs() {
    return {
      first: await screen.findByRole('textbox', { name: /First name/ }),
      last: screen.getByRole('textbox', { name: /Last name/ }),
    };
  }

  it('prefills the names and sends only the changed one', async () => {
    serveNames('Jane', 'Snow');
    const bodies = capturePatches();
    renderWithProviders(<EditProfilePage />);
    const { first, last } = await nameInputs();
    expect(first).toHaveValue('Jane');
    expect(last).toHaveValue('Snow');

    await userEvent.clear(last);
    await userEvent.type(last, ' Frost ');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ lastName: 'Frost' });
    expect(bodies[0]).not.toHaveProperty('firstName');
  });

  it('sends no names when they are unchanged', async () => {
    serveNames('Jane', 'Snow');
    const bodies = capturePatches();
    renderWithProviders(<EditProfilePage />);
    await nameInputs();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty('firstName');
    expect(bodies[0]).not.toHaveProperty('lastName');
  });

  it('blocks clearing a name that was set', async () => {
    serveNames('Jane', 'Snow');
    const bodies = capturePatches();
    renderWithProviders(<EditProfilePage />);
    const { first } = await nameInputs();
    await userEvent.clear(first);
    await userEvent.type(first, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument();
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(bodies).toHaveLength(0);
  });

  it('lets an account without names save with both left empty', async () => {
    const bodies = capturePatches();
    renderWithProviders(<EditProfilePage />);
    const { first, last } = await nameInputs();
    expect(first).toHaveValue('');
    expect(last).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty('firstName');
    expect(bodies[0]).not.toHaveProperty('lastName');
  });

  it('requires both names once one is entered', async () => {
    const bodies = capturePatches();
    renderWithProviders(<EditProfilePage />);
    const { first, last } = await nameInputs();
    await userEvent.type(first, 'Jane');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument();
    expect(last).toHaveAttribute('aria-invalid', 'true');
    expect(first).toHaveAttribute('aria-invalid', 'false');
    expect(bodies).toHaveLength(0);

    await userEvent.type(last, 'Snow');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ firstName: 'Jane', lastName: 'Snow' });
  });

  it('labels the name fields in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveNames('简', '雪');
    renderWithProviders(<EditProfilePage />);
    expect(
      await screen.findByRole('textbox', { name: /^名\s*\*?$/ }),
    ).toHaveValue('简');
    expect(screen.getByRole('textbox', { name: /^姓\s*\*?$/ })).toHaveValue(
      '雪',
    );
  });
});
