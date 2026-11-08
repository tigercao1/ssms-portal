import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
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
      body: { emailCopy: false },
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
      .map((r) => r.body as { title: string; expectedUpdatedAt?: string });

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
});
