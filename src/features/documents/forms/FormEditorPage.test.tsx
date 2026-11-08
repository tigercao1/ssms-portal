import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { api } from '@/lib/api';
import {
  createFormsState,
  formsHandlers,
  type FormsMockState,
} from './fixtures';
import { FormEditorPage } from './FormEditorPage';

let state: FormsMockState;

beforeEach(() => {
  state = createFormsState();
  server.use(...formsHandlers(state));
});

function renderEditor(route = '/admin/signing-forms/form-waiver') {
  renderWithProviders(
    <Routes>
      <Route path="/admin/signing-forms/:id" element={<FormEditorPage />} />
      <Route path="/admin/signing-forms" element={<p>Forms list</p>} />
    </Routes>,
    { route, dataRouter: true },
  );
  return screen.findByRole('tab', { name: 'English' });
}

const fieldList = () => screen.getByRole('list', { name: 'Fields' });

describe('FormEditorPage', () => {
  it('shows the published English version with its public link and the legal note', async () => {
    await renderEditor();

    expect(
      screen.getByRole('heading', { name: 'Liability waiver' }),
    ).toBeVisible();
    expect(screen.getByText('Published v1')).toBeVisible();
    expect(screen.getByLabelText(/Title signers see/)).toHaveValue(
      'Liability waiver',
    );
    expect(
      (screen.getByRole('textbox', { name: 'Text' }) as HTMLTextAreaElement)
        .value,
    ).toContain('Skiing has risks.');
    expect(
      screen.getByText(/original PDF is attached, it is the legal copy/),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'https://sign.ssnow.club/w/waiver' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(
      screen.getByText('Save a draft first; there is nothing new to publish.'),
    ).toBeVisible();
  });

  it('previews the text the way signers see it, without running markup', async () => {
    const user = userEvent.setup();
    await renderEditor();

    const text = screen.getByRole('textbox', { name: 'Text' });
    await user.clear(text);
    await user.type(
      text,
      '# Rules{enter}{enter}<img src=x onerror=alert(1)> **Bold**',
    );
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    const preview = screen.getByTestId('body-preview');
    expect(
      within(preview).getByRole('heading', { name: 'Rules' }),
    ).toBeVisible();
    expect(within(preview).getByText('Bold').tagName).toBe('STRONG');
    expect(preview.querySelector('img')).toBeNull();
    expect(within(preview).getByText(/<img src=x/)).toBeVisible();
  });

  it('saves a new English draft and then publishes it', async () => {
    const user = userEvent.setup();
    await renderEditor();

    const title = screen.getByLabelText(/Title signers see/);
    await user.clear(title);
    await user.type(title, 'Waiver 2026/27 ');
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(
      screen.getByText('Save your changes before publishing.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Draft v2 saved.')).toBeVisible();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    const put = state.requests.find((r) => r.method === 'PUT');
    expect(put).toMatchObject({
      path: '/admin/documents/forms/form-waiver/versions/en',
      body: { title: 'Waiver 2026/27' },
    });

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(
      await screen.findByText(
        'Published version 2 in English. The public link now shows it.',
      ),
    ).toBeVisible();
    expect(state.forms[0]!.languages.en.published?.title).toBe(
      'Waiver 2026/27',
    );
  });

  it('edits the Chinese draft on its own tab', async () => {
    const user = userEvent.setup();
    await renderEditor('/admin/signing-forms/form-waiver?lang=zh');

    expect(screen.getByRole('tab', { name: 'Chinese' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Draft v1')).toBeVisible();
    expect(screen.getByLabelText(/Title signers see/)).toHaveValue('免责声明');
    expect(screen.getByLabelText('Label for participant_name')).toHaveValue(
      '参与者姓名',
    );

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(
      await screen.findByText(
        'Published version 1 in Chinese. The public link now shows it.',
      ),
    ).toBeVisible();
    expect(state.requests.at(-1)).toMatchObject({
      method: 'POST',
      path: '/admin/documents/forms/form-waiver/versions/zh/publish',
    });
  });

  it('asks before the Back link leaves unsaved changes', async () => {
    const user = userEvent.setup();
    await renderEditor();
    const title = screen.getByLabelText(/Title signers see/);
    await user.type(title, ' NEW');

    await user.click(screen.getByRole('link', { name: /Signing forms/ }));
    const ask = await screen.findByRole('dialog', {
      name: 'Leave without saving?',
    });
    await user.click(within(ask).getByRole('button', { name: 'Keep editing' }));
    expect(title).toHaveValue('Liability waiver NEW');

    await user.click(screen.getByRole('link', { name: /Signing forms/ }));
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Leave without saving?' }),
      ).getByRole('button', { name: 'Leave without saving' }),
    );
    expect(await screen.findByText('Forms list')).toBeVisible();
    expect(state.requests).toEqual([]);
  });

  it('asks before switching language with unsaved changes', async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.type(screen.getByLabelText(/Title signers see/), '!');

    await user.click(screen.getByRole('tab', { name: 'Chinese' }));
    const ask = await screen.findByRole('dialog', {
      name: 'Leave without saving?',
    });
    await user.click(within(ask).getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('tab', { name: 'English' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText(/Title signers see/)).toHaveValue(
      'Liability waiver!',
    );

    await user.click(screen.getByRole('tab', { name: 'Chinese' }));
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Leave without saving?' }),
      ).getByRole('button', { name: 'Leave without saving' }),
    );
    expect(screen.getByLabelText(/Title signers see/)).toHaveValue('免责声明');
  });

  it('switches language without asking when nothing changed', async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(screen.getByRole('tab', { name: 'Chinese' }));
    expect(screen.getByLabelText(/Title signers see/)).toHaveValue('免责声明');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('starts a form with no version from the default fields', async () => {
    const user = userEvent.setup();
    await renderEditor('/admin/signing-forms/form-rental');

    expect(screen.getByText('No version yet')).toBeVisible();
    expect(within(fieldList()).getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByLabelText(/Title signers see/)).toHaveValue(
      'Equipment rental agreement',
    );
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();

    await user.type(
      screen.getByRole('textbox', { name: 'Text' }),
      'Return the skis.',
    );
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Draft v1 saved.')).toBeVisible();
    expect(state.requests.at(-1)).toMatchObject({
      method: 'PUT',
      path: '/admin/documents/forms/form-rental/versions/en',
      body: { bodyMarkdown: 'Return the skis.' },
    });
  });

  it('lets admins rename, require, remove and re-add fields within the API rules', async () => {
    const user = userEvent.setup();
    await renderEditor();

    expect(
      screen.queryByRole('button', { name: 'Remove Participant name' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Required: Email' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('switch', { name: 'Required: Initials' }),
    );
    await user.click(screen.getByRole('button', { name: 'Remove ID number' }));
    const label = screen.getByLabelText('Label for date');
    await user.clear(label);
    await user.type(label, 'Date signed');

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Add a field' }),
      'guardian_signature',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await screen.findByText('Draft v2 saved.');
    const put = state.requests.find((r) => r.method === 'PUT');
    expect((put?.body as { fields: unknown[] }).fields).toEqual([
      {
        key: 'participant_name',
        type: 'text',
        required: true,
        label: 'Participant name',
      },
      { key: 'email', type: 'email', required: true, label: 'Email' },
      { key: 'date', type: 'date', required: true, label: 'Date signed' },
      { key: 'initials', type: 'text', required: true, label: 'Initials' },
      {
        key: 'participant_signature',
        type: 'signature',
        required: true,
        label: 'Participant signature',
      },
      {
        key: 'guardian_signature',
        type: 'signature',
        required: false,
        label: 'Guardian signature',
      },
    ]);
  });

  it('blocks saving without a required signature or with an empty label', async () => {
    const user = userEvent.setup();
    await renderEditor();

    await user.click(
      screen.getByRole('button', { name: 'Remove Participant signature' }),
    );
    expect(
      screen.getByText('Keep at least one required signature field.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Add a field' }),
      'participant_signature',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.clear(screen.getByLabelText('Label for email'));
    expect(screen.getByText('Every field needs a label.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });

  it('shows the API message when saving fails', async () => {
    const user = userEvent.setup();
    state.forms[0]!.languages.en.published!.fields = [];
    await renderEditor();

    await user.type(screen.getByRole('textbox', { name: 'Text' }), ' More.');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Add a field' }),
      'participant_signature',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText(
        'Could not save the draft: The field list is not valid: it needs a required participant_name text field and a required email field',
      ),
    ).toBeVisible();
  });

  it('turns the email copy off for the whole form', async () => {
    const user = userEvent.setup();
    await renderEditor();

    const toggle = screen.getByRole('switch', { name: 'Email signers a copy' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);

    expect(state.requests).toContainEqual({
      method: 'PATCH',
      path: '/admin/documents/forms/form-waiver',
      body: { emailCopy: false, expectedUpdatedAt: '2026-11-01T15:00:00Z' },
    });
    await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false');
  });
});

describe('FormEditorPage saves and other admins', () => {
  const DRAFT_PUT =
    'http://localhost:3000/admin/documents/forms/:id/versions/zh';
  const puts = () =>
    state.requests
      .filter((r) => r.method === 'PUT')
      .map(
        (r) => r.body as { title: string; expectedUpdatedAt?: string | null },
      );

  function holdFirstSave() {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let calls = 0;
    server.use(
      http.put(DRAFT_PUT, async () => {
        calls += 1;
        if (calls === 1) await held;
      }),
    );
    return { release, calls: () => calls };
  }

  function changedByAnotherAdmin() {
    const draft = state.forms[0]!.languages.zh.draft!;
    draft.title = 'Changed by Sam';
    draft.updatedAt = '2026-11-08T10:00:00.000Z';
  }

  it('keeps one draft save in flight and keeps edits made meanwhile for the next save', async () => {
    const user = userEvent.setup();
    const hold = holdFirstSave();
    await renderEditor('/admin/signing-forms/form-waiver?lang=zh');
    const title = screen.getByLabelText(/Title signers see/);

    fireEvent.change(title, { target: { value: 'FIRST' } });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(hold.calls()).toBe(1));
    fireEvent.change(title, { target: { value: 'SECOND' } });
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();

    hold.release();
    await waitFor(() =>
      expect(state.forms[0]!.languages.zh.draft!.title).toBe('FIRST'),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled(),
    );
    expect(title).toHaveValue('SECOND');
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    expect(hold.calls()).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft v1 saved.');
    expect(state.forms[0]!.languages.zh.draft!.title).toBe('SECOND');
    expect(puts().map((b) => b.title)).toEqual(['FIRST', 'SECOND']);
  });

  it('sends the revision it loaded and chains the one each write returns', async () => {
    const user = userEvent.setup();
    await renderEditor('/admin/signing-forms/form-waiver?lang=zh');
    const title = screen.getByLabelText(/Title signers see/);

    await user.type(title, ' 1');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft v1 saved.');
    const afterFirst = state.forms[0]!.languages.zh.draft!.updatedAt;
    await user.type(title, ' 2');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    await screen.findByText('Draft v1 saved.');
    const afterSecond = state.forms[0]!.languages.zh.draft!.updatedAt;
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText(/Published version 1 in Chinese/);

    expect(puts().map((b) => b.expectedUpdatedAt)).toEqual([
      '2026-11-07T18:30:00Z',
      afterFirst,
    ]);
    expect(afterSecond).not.toBe(afterFirst);
    expect(state.requests.at(-1)).toMatchObject({
      method: 'POST',
      body: { expectedUpdatedAt: afterSecond },
    });
  });

  it('reloads a draft another admin changed and offers the unsaved text back', async () => {
    const user = userEvent.setup();
    await renderEditor('/admin/signing-forms/form-waiver?lang=zh');
    changedByAnotherAdmin();
    const title = screen.getByLabelText(/Title signers see/);

    await user.type(title, ' mine');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(title).toHaveValue('Changed by Sam');
    expect(state.forms[0]!.languages.zh.draft!.title).toBe('Changed by Sam');

    await user.click(screen.getByRole('button', { name: 'Put my text back' }));
    expect(title).toHaveValue('免责声明 mine');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft v1 saved.');
    expect(puts().at(-1)).toMatchObject({
      title: '免责声明 mine',
      expectedUpdatedAt: '2026-11-08T10:00:00.000Z',
    });
  });

  it('does not publish a draft another admin changed, and reloads it', async () => {
    const user = userEvent.setup();
    await renderEditor('/admin/signing-forms/form-waiver?lang=zh');
    changedByAnotherAdmin();

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(screen.getByLabelText(/Title signers see/)).toHaveValue(
      'Changed by Sam',
    );
    expect(state.forms[0]!.languages.zh.published).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Put my text back' }),
    ).not.toBeInTheDocument();
  });

  it('sends the form revision with the email copy switch exactly as received and chains it', async () => {
    const user = userEvent.setup();
    state.forms[0]!.updatedAt = '2026-11-08T18:30:00.123456+00:00';
    await renderEditor();
    const toggle = screen.getByRole('switch', { name: 'Email signers a copy' });

    await user.click(toggle);
    await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(toggle).toBeEnabled());
    const afterFirst = state.forms[0]!.updatedAt;
    await user.click(toggle);
    await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('true');

    expect(
      state.requests.filter((r) => r.method === 'PATCH').map((r) => r.body),
    ).toEqual([
      {
        emailCopy: false,
        expectedUpdatedAt: '2026-11-08T18:30:00.123456+00:00',
      },
      { emailCopy: true, expectedUpdatedAt: afterFirst },
    ]);
  });

  it('reloads the form when another admin changed it and keeps the email copy choice to save again', async () => {
    const user = userEvent.setup();
    await renderEditor();
    state.forms[0]!.titleEn = 'Renamed by Sam';
    state.forms[0]!.updatedAt = '2026-11-08T10:00:00.000Z';

    await user.click(
      screen.getByRole('switch', { name: 'Email signers a copy' }),
    );

    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Your choice to turn the email copy off was not saved\./,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Renamed by Sam' }),
    ).toBeVisible();
    expect(state.forms[0]!.emailCopy).toBe(true);
    expect(screen.queryByText(/Could not change/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save my choice' }));
    await waitFor(() => expect(state.forms[0]!.emailCopy).toBe(false));
    expect(state.requests.at(-1)).toMatchObject({
      method: 'PATCH',
      body: { emailCopy: false, expectedUpdatedAt: '2026-11-08T10:00:00.000Z' },
    });
    expect(screen.queryByText(/so it was reloaded/)).not.toBeInTheDocument();
  });

  it('keeps text typed while a publish request returns 409 and offers it back', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let started = false;
    server.use(
      http.post(`${DRAFT_PUT}/publish`, async () => {
        started = true;
        await held;
      }),
    );
    const user = userEvent.setup();
    await renderEditor('/admin/signing-forms/form-waiver?lang=zh');
    const title = screen.getByLabelText(/Title signers see/);

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(started).toBe(true));
    fireEvent.change(title, { target: { value: 'TYPED WHILE PUBLISHING' } });
    changedByAnotherAdmin();
    release();

    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(title).toHaveValue('Changed by Sam');
    await user.click(screen.getByRole('button', { name: 'Put my text back' }));
    expect(title).toHaveValue('TYPED WHILE PUBLISHING');
    expect(state.forms[0]!.languages.zh.published).toBeNull();
  });

  it('keeps text typed while the reload after a publish 409 is loading', async () => {
    const user = userEvent.setup();
    await renderEditor('/admin/signing-forms/form-waiver?lang=zh');
    const title = screen.getByLabelText(/Title signers see/);
    changedByAnotherAdmin();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let reloading = false;
    server.use(
      http.get(
        'http://localhost:3000/admin/documents/forms/:id',
        async () => {
          reloading = true;
          await held;
        },
        { once: true },
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(reloading).toBe(true));
    fireEvent.change(title, { target: { value: 'TYPED WHILE RELOADING' } });
    release();

    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(title).toHaveValue('Changed by Sam');
    await user.click(screen.getByRole('button', { name: 'Put my text back' }));
    expect(title).toHaveValue('TYPED WHILE RELOADING');
  });

  it('sends a null revision on the first draft of a published-only language, then chains the returned one', async () => {
    const user = userEvent.setup();
    await renderEditor();
    const title = screen.getByLabelText(/Title signers see/);

    await user.type(title, ' 1');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft v2 saved.');
    const afterFirst = state.forms[0]!.languages.en.draft!.updatedAt;
    await user.type(title, ' 2');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    await screen.findByText('Draft v2 saved.');

    expect(puts().map((b) => b.expectedUpdatedAt)).toEqual([null, afterFirst]);
  });

  it('does not overwrite a draft another admin created from the same published-only version', async () => {
    const user = userEvent.setup();
    await renderEditor();
    const slot = state.forms[0]!.languages.en;
    slot.draft = {
      ...slot.published!,
      version: 2,
      publishedAt: null,
      title: 'Draft by Sam',
      updatedAt: '2026-11-08T20:00:00.123456+00:00',
    };
    const title = screen.getByLabelText(/Title signers see/);

    fireEvent.change(title, { target: { value: 'My first draft' } });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(slot.draft.title).toBe('Draft by Sam');
    expect(title).toHaveValue('Draft by Sam');
    await user.click(screen.getByRole('button', { name: 'Put my text back' }));
    expect(title).toHaveValue('My first draft');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft v2 saved.');
    expect(puts().map((b) => b.expectedUpdatedAt)).toEqual([
      null,
      '2026-11-08T20:00:00.123456+00:00',
    ]);
    expect(slot.draft.title).toBe('My first draft');
  });
});

describe('FormEditorPage revision across language switches', () => {
  const EN_PUT = 'http://localhost:3000/admin/documents/forms/:id/versions/en';
  const title = () => screen.getByLabelText(/Title signers see/);
  const enDraft = () => state.forms[0]!.languages.en.draft!;
  const publishes = () =>
    state.requests.filter((r) => r.path.endsWith('/publish'));

  function holdFirstEnglishSave() {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const bodies: string[] = [];
    server.use(
      http.put(EN_PUT, async ({ request }) => {
        bodies.push(await request.clone().text());
        if (bodies.length === 1) await held;
      }),
    );
    return { release, bodies };
  }

  async function saveFirstEnglishDraftThenLeave() {
    const user = userEvent.setup();
    const hold = holdFirstEnglishSave();
    await renderEditor();
    fireEvent.change(title(), { target: { value: 'EN FIRST' } });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(hold.bodies).toHaveLength(1));
    await user.click(screen.getByRole('tab', { name: 'Chinese' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Leave without saving',
      }),
    );
    expect(title()).toHaveValue('免责声明');
    return { user, hold };
  }

  it('does not publish a newer draft by another admin after returning during the first save and discarding', async () => {
    const { user, hold } = await saveFirstEnglishDraftThenLeave();
    await user.click(screen.getByRole('tab', { name: 'English' }));
    hold.release();
    await waitFor(() => expect(enDraft().title).toBe('EN FIRST'));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(title()).toHaveValue('EN FIRST');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled(),
    );
    const loaded = enDraft().updatedAt;
    enDraft().title = 'UNSEEN SAM DRAFT';
    enDraft().updatedAt = '2026-11-08T22:00:00.123456+00:00';

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(publishes().map((r) => r.body)).toEqual([
      { expectedUpdatedAt: loaded },
    ]);
    expect(state.forms[0]!.languages.en.published!.title).toBe(
      'Liability waiver',
    );
    expect(enDraft().title).toBe('UNSEEN SAM DRAFT');
    expect(title()).toHaveValue('UNSEEN SAM DRAFT');
  });

  it('keeps Save disabled when returning before the first save ends, then chains its revision', async () => {
    const { user, hold } = await saveFirstEnglishDraftThenLeave();
    await user.click(screen.getByRole('tab', { name: 'English' }));
    fireEvent.change(title(), { target: { value: 'EN NEXT' } });
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();

    hold.release();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled(),
    );
    const returned = enDraft().updatedAt;
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(hold.bodies).toHaveLength(2));

    expect(JSON.parse(hold.bodies[0]!)).toHaveProperty(
      'expectedUpdatedAt',
      null,
    );
    expect(JSON.parse(hold.bodies[1]!)).toMatchObject({
      title: 'EN NEXT',
      expectedUpdatedAt: returned,
    });
    await waitFor(() => expect(enDraft().title).toBe('EN NEXT'));
  });

  it('shows the saved draft when returning after the first save ends and chains its revision', async () => {
    const { user, hold } = await saveFirstEnglishDraftThenLeave();
    hold.release();
    await waitFor(() => expect(enDraft().title).toBe('EN FIRST'));
    await user.click(screen.getByRole('tab', { name: 'English' }));
    expect(title()).toHaveValue('EN FIRST');
    const returned = enDraft().updatedAt;

    fireEvent.change(title(), { target: { value: 'EN NEXT' } });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft v2 saved.');

    expect(JSON.parse(hold.bodies[1]!)).toHaveProperty(
      'expectedUpdatedAt',
      returned,
    );
  });

  it('publishes the saved draft after Discard once the first save returned', async () => {
    const { user, hold } = await saveFirstEnglishDraftThenLeave();
    await user.click(screen.getByRole('tab', { name: 'English' }));
    hold.release();
    await waitFor(() => expect(enDraft().title).toBe('EN FIRST'));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    const returned = enDraft().updatedAt;

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await screen.findByText(/Published version 2 in English/);
    expect(publishes().map((r) => r.body)).toEqual([
      { expectedUpdatedAt: returned },
    ]);
    expect(state.forms[0]!.languages.en.published!.title).toBe('EN FIRST');
  });

  it('sends the draft revision string exactly as received in the publish request', async () => {
    state.forms[0]!.languages.zh.draft!.updatedAt =
      '2026-11-08T18:30:00.123456+00:00';
    const raw: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/publish'))
        void request
          .clone()
          .text()
          .then((t) => raw.push(t));
    });
    const user = userEvent.setup();
    await renderEditor('/admin/signing-forms/form-waiver?lang=zh');

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText(/Published version 1 in Chinese/);
    server.events.removeAllListeners();

    expect(raw).toEqual([
      '{"expectedUpdatedAt":"2026-11-08T18:30:00.123456+00:00"}',
    ]);
  });

  it('reloads instead of publishing a draft whose revision it never loaded', async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(screen.getByRole('tab', { name: 'Chinese' }));
    state.forms[0]!.languages.en.draft = {
      ...state.forms[0]!.languages.en.published!,
      version: 2,
      publishedAt: null,
      title: 'Draft by Sam',
      updatedAt: '2026-11-08T20:00:00.123456+00:00',
    };
    fireEvent.change(title(), { target: { value: '免责声明 2' } });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft v1 saved.');
    await user.click(screen.getByRole('tab', { name: 'English' }));
    expect(title()).toHaveValue('Draft by Sam');

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(publishes()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText(/Published version 2 in English/);
    expect(publishes().map((r) => r.body)).toEqual([
      { expectedUpdatedAt: '2026-11-08T20:00:00.123456+00:00' },
    ]);
  });

  it('refuses a null revision outside the draft save, like the API', async () => {
    const path = '/admin/documents/forms/form-waiver';
    await expect(
      api(path, {
        method: 'PATCH',
        body: { emailCopy: false, expectedUpdatedAt: null },
      }),
    ).rejects.toMatchObject({ status: 500 });
    await expect(
      api(`${path}/versions/zh/publish`, {
        method: 'POST',
        body: { expectedUpdatedAt: null },
      }),
    ).rejects.toMatchObject({ status: 500 });
    expect(state.forms[0]!.emailCopy).toBe(true);
    expect(state.forms[0]!.languages.zh.published).toBeNull();
  });
});
