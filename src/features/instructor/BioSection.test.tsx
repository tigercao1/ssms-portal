import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { EditProfilePage } from './EditProfilePage';
import { staleSide, writtenLangs } from './BioSection';
import { renderWithProviders } from '@/test/render';
import { fakeProfile, server } from '@/test/msw';
import type {
  BioAiUsage,
  InstructorProfile,
  UpdateProfileBody,
} from '@/lib/types';

const API = 'http://localhost:3000';
const usage = (
  remaining: number,
  resetsAt: string | null = null,
): BioAiUsage => ({
  limit: 5,
  used: 5 - remaining,
  remaining,
  resetsAt,
});

const noBio: InstructorProfile = {
  ...fakeProfile,
  bioEn: null,
  bioZh: null,
  bioEnUpdatedAt: null,
  bioZhUpdatedAt: null,
};

const bothBios: InstructorProfile = {
  ...fakeProfile,
  bioEn: 'Veteran instructor.',
  bioZh: '资深教练。',
  bioZhMachineTranslated: true,
  bioZhTranslatedBy: 'gemini-test',
  bioEnUpdatedAt: '2026-10-01T00:00:00Z',
  bioZhUpdatedAt: '2026-10-01T00:00:00Z',
};

const BIO_SIDES = [
  {
    text: 'bioEn',
    machine: 'bioEnMachineTranslated',
    by: 'bioEnTranslatedBy',
    at: 'bioEnUpdatedAt',
  },
  {
    text: 'bioZh',
    machine: 'bioZhMachineTranslated',
    by: 'bioZhTranslatedBy',
    at: 'bioZhUpdatedAt',
  },
] as const;

function applyPatch(
  current: InstructorProfile,
  body: UpdateProfileBody,
): InstructorProfile {
  const now = new Date().toISOString();
  const next: InstructorProfile = { ...current, ...body } as InstructorProfile;
  for (const side of BIO_SIDES) {
    next[side.machine] = current[side.machine];
    if (!(side.text in body)) continue;
    const text = body[side.text] ?? null;
    if ((text ?? '') === (current[side.text] ?? '')) {
      next[side.text] = current[side.text];
      continue;
    }
    const machine = body[side.machine] === true && Boolean(text);
    next[side.machine] = machine;
    if (machine) next[side.by] = 'gemini-test';
    next[side.at] = now;
  }
  if ('bioEn' in body && 'bioZh' in body) {
    next.bioEnUpdatedAt = now;
    next.bioZhUpdatedAt = now;
  }
  return next;
}

function setup(
  profile: InstructorProfile,
  {
    remaining = 5,
    draft = () =>
      HttpResponse.json({
        en: 'EN draft',
        zh: '中文稿',
        sourceLangs: ['en'],
        model: 'gemini-test',
        usage: usage(4),
      }),
  }: {
    remaining?: number;
    draft?: Parameters<typeof http.post>[1];
  } = {},
) {
  const patches: UpdateProfileBody[] = [];
  const drafts: unknown[] = [];
  let current = profile;
  server.use(
    http.get(`${API}/me/instructor`, () => HttpResponse.json(current)),
    http.get(`${API}/me/instructor/bio/ai-usage`, () =>
      HttpResponse.json(
        usage(remaining, remaining ? null : '2026-10-15T09:30:00Z'),
      ),
    ),
    http.post(`${API}/me/instructor/bio/draft`, async (info) => {
      drafts.push(await info.request.clone().json());
      return draft(info);
    }),
    http.patch(`${API}/me/instructor`, async ({ request }) => {
      const body = (await request.json()) as UpdateProfileBody;
      patches.push(body);
      current = applyPatch(current, body);
      return HttpResponse.json(current);
    }),
  );
  return { patches, drafts };
}

const langButton = (name: string) =>
  within(screen.getByRole('group', { name: 'I’m writing in' })).getByRole(
    'button',
    { name },
  );

async function compose(texts: { en?: string; zh?: string }) {
  renderWithProviders(<EditProfilePage />);
  await screen.findByRole('group', { name: 'I’m writing in' });
  if (texts.zh) await userEvent.click(langButton('中文'));
  const lang = texts.zh ? '中文' : 'English';
  const box = screen.getByRole('textbox', { name: lang });
  await userEvent.type(box, texts.zh ?? texts.en ?? '');
  return { en: box, zh: box };
}

const bioCard = () =>
  screen.getByRole('heading', { name: 'Bio' }).parentElement as HTMLElement;
const dialog = () => screen.getByRole('dialog', { name: 'Review your bio' });
const saveButton = () =>
  within(bioCard()).getByRole('button', { name: 'Save' });

describe('BioSection first-time flow', () => {
  it('shows one box in the preferred language with the daily count and no Use as written', async () => {
    setup(noBio, { remaining: 3 });
    renderWithProviders(<EditProfilePage />);
    expect(
      await screen.findByRole('textbox', { name: 'English' }),
    ).toHaveAttribute('maxLength', '1000');
    expect(langButton('English')).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryByRole('textbox', { name: '中文' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Write your bio in one language/),
    ).toBeInTheDocument();
    expect(await screen.findByText('3 of 5 left today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refine' })).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText('Use as written')).not.toBeInTheDocument();
  });

  it('Save with only English translates it and flags the Chinese side', async () => {
    const { patches, drafts } = setup(noBio, {
      draft: async () => {
        await delay(20);
        return HttpResponse.json({
          en: 'I teach skiing!',
          zh: '我教滑雪。',
          sourceLangs: ['en'],
          model: 'gemini-test',
          usage: usage(4),
        });
      },
    });
    await compose({ en: 'I teach skiing' });
    await userEvent.click(saveButton());
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'I teach skiing',
          bioEnMachineTranslated: false,
          bioZh: '我教滑雪。',
          bioZhMachineTranslated: true,
        },
      ]),
    );
    expect(drafts).toEqual([{ text: 'I teach skiing', mode: 'translate' }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('我教滑雪。')).toBeInTheDocument();
    expect(screen.getByText('I teach skiing')).toBeInTheDocument();
  });

  it('Save with only Chinese flags the English translation', async () => {
    const { patches, drafts } = setup(noBio, {
      draft: () =>
        HttpResponse.json({
          en: 'I am a coach.',
          zh: '我是教练！',
          sourceLangs: ['zh-CN'],
          model: 'gemini-test',
          usage: usage(4),
        }),
    });
    await compose({ zh: '我是教练。' });
    await userEvent.click(saveButton());
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioZh: '我是教练。',
          bioZhMachineTranslated: false,
          bioEn: 'I am a coach.',
          bioEnMachineTranslated: true,
        },
      ]),
    );
    expect(drafts).toEqual([{ text: '我是教练。', mode: 'translate' }]);
  });

  it('defaults the picker to a Chinese preferred language', async () => {
    setup({ ...noBio, preferredLanguage: 'zh-CN' });
    renderWithProviders(<EditProfilePage />);
    expect(
      await screen.findByRole('textbox', { name: '中文' }),
    ).toBeInTheDocument();
    expect(langButton('中文')).toHaveAttribute('aria-pressed', 'true');
  });

  it('nudges to switch when the text is in the other language, and keeps the text', async () => {
    const { patches } = setup(noBio, {
      draft: () =>
        HttpResponse.json({
          en: 'I am a coach.',
          zh: '我是滑雪教练',
          sourceLangs: ['zh-CN'],
          model: 'gemini-test',
          usage: usage(4),
        }),
    });
    renderWithProviders(<EditProfilePage />);
    const box = await screen.findByRole('textbox', { name: 'English' });
    await userEvent.type(box, '我是滑雪教练');
    expect(screen.getByText('This looks like Chinese.')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to 中文' }),
    );
    expect(screen.getByRole('textbox', { name: '中文' })).toHaveValue(
      '我是滑雪教练',
    );
    expect(
      screen.queryByText('This looks like Chinese.'),
    ).not.toBeInTheDocument();
    await userEvent.click(saveButton());
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioZh: '我是滑雪教练',
          bioZhMachineTranslated: false,
          bioEn: 'I am a coach.',
          bioEnMachineTranslated: true,
        },
      ]),
    );
  });

  it('nudges back to English when English text is under 中文', async () => {
    setup(noBio);
    renderWithProviders(<EditProfilePage />);
    await screen.findByRole('textbox', { name: 'English' });
    await userEvent.click(langButton('中文'));
    await userEvent.type(
      screen.getByRole('textbox', { name: '中文' }),
      'I teach skiing',
    );
    expect(screen.getByText('This looks like English.')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('refines English text and marks only the translated side as machine-translated', async () => {
    const { patches, drafts } = setup(noBio, {
      draft: async () => {
        await delay(300);
        return HttpResponse.json({
          en: 'Polished.',
          zh: '润色。',
          sourceLangs: ['en'],
          model: 'gemini-test',
          usage: usage(4),
        });
      },
    });
    await compose({ en: 'I teach skiing' });
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));

    expect(
      await within(dialog()).findByText('Polishing and translating…'),
    ).toBeInTheDocument();
    expect(await within(dialog()).findByText('Polished.')).toBeInTheDocument();
    expect(within(dialog()).getByText('润色。')).toBeInTheDocument();
    expect(
      within(dialog()).getByText('Translated by gemini-test'),
    ).toBeInTheDocument();
    expect(drafts).toEqual([{ text: 'I teach skiing', mode: 'refine' }]);
    expect(screen.getByText('4 of 5 left today')).toBeInTheDocument();

    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Save' }),
    );
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'Polished.',
          bioZh: '润色。',
          bioEnMachineTranslated: false,
          bioZhMachineTranslated: true,
        },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Edit English bio' }),
    ).toBeInTheDocument();
  });

  it('drops the machine flag when the translation is edited by hand', async () => {
    const { patches } = setup(noBio);
    await compose({ en: 'Hello there' });
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    await userEvent.click(
      await within(dialog()).findByRole('button', { name: 'Edit Chinese bio' }),
    );
    const zh = within(dialog()).getByRole('textbox', { name: '中文' });
    expect(zh).toHaveAttribute('maxLength', '1000');
    await userEvent.type(zh, '！');
    expect(
      within(dialog()).queryByText(/Translated by/),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Save' }),
    );
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'EN draft',
          bioZh: '中文稿！',
          bioEnMachineTranslated: false,
          bioZhMachineTranslated: false,
        },
      ]),
    );
  });

  it('translates instead of saving empty when a review card is cleared', async () => {
    let calls = 0;
    const { patches, drafts } = setup(noBio, {
      draft: () =>
        HttpResponse.json(
          calls++ === 0
            ? {
                en: 'EN draft',
                zh: '中文稿',
                sourceLangs: ['en'],
                model: 'gemini-test',
                usage: usage(4),
              }
            : {
                en: 'EN draft',
                zh: '重新翻译',
                sourceLangs: ['en'],
                model: 'gemini-test',
                usage: usage(3),
              },
        ),
    });
    await compose({ en: 'Hello' });
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    await userEvent.click(
      await within(dialog()).findByRole('button', { name: 'Edit Chinese bio' }),
    );
    await userEvent.clear(
      within(dialog()).getByRole('textbox', { name: '中文' }),
    );
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Save' }),
    );
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'EN draft',
          bioEnMachineTranslated: false,
          bioZh: '重新翻译',
          bioZhMachineTranslated: true,
        },
      ]),
    );
    expect(drafts).toEqual([
      { text: 'Hello', mode: 'refine' },
      { text: 'EN draft', mode: 'translate' },
    ]);
  });

  it('opens the card for editing when the card itself is clicked', async () => {
    setup(noBio);
    await compose({ en: 'Hello' });
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    await userEvent.click(await within(dialog()).findByText('EN draft'));
    expect(
      within(dialog()).getByRole('textbox', { name: 'English' }),
    ).toHaveValue('EN draft');
  });

  it('Back closes the modal, saves nothing and keeps the text', async () => {
    const { patches } = setup(noBio);
    const { en } = await compose({ en: 'Keep me' });
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    await within(dialog()).findByText('EN draft');
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Back' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(en).toHaveValue('Keep me');
    expect(patches).toHaveLength(0);
  });
});

describe('BioSection errors', () => {
  it('shows the daily limit with its reset time and keeps the text on 429', async () => {
    setup(noBio, {
      draft: () =>
        HttpResponse.json(
          { code: 'bio_ai_limit', usage: usage(0, '2026-10-15T09:30:00Z') },
          { status: 429 },
        ),
    });
    const { en } = await compose({ en: 'My bio' });
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    expect(
      await within(dialog()).findByText(
        /You’ve used all 5 AI requests for today. Try again after/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog()).queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Back' }),
    );
    expect(en).toHaveValue('My bio');
    expect(screen.getByText('0 of 5 left today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refine' })).toBeDisabled();
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText(/Try again after/)).toBeInTheDocument();
  });

  it('says AI is unavailable on 503 and keeps the text', async () => {
    setup(noBio, {
      draft: () =>
        HttpResponse.json({ code: 'bio_ai_unavailable' }, { status: 503 }),
    });
    const { en } = await compose({ en: 'My bio' });
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    expect(
      await within(dialog()).findByText(/AI is unavailable right now/),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(en).toHaveValue('My bio');
    expect(screen.getByRole('button', { name: 'Refine' })).toBeEnabled();
  });

  it('falls back to a generic error for anything else', async () => {
    setup(noBio, { draft: () => HttpResponse.json({}, { status: 500 }) });
    await compose({ en: 'My bio' });
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    expect(
      await within(dialog()).findByText('Something went wrong.'),
    ).toBeInTheDocument();
  });

  it.each([
    [429, { code: 'bio_ai_limit', usage: usage(0, '2026-10-15T09:30:00Z') }],
    [503, { code: 'bio_ai_unavailable' }],
  ])(
    'saves only the written language and explains when translation fails with %i',
    async (status, body) => {
      const { patches } = setup(noBio, {
        draft: () => HttpResponse.json(body, { status }),
      });
      await compose({ en: 'My bio' });
      await userEvent.click(saveButton());
      await waitFor(() =>
        expect(patches).toEqual([
          { bioEn: 'My bio', bioEnMachineTranslated: false },
        ]),
      );
      expect(
        await screen.findByText(
          /the other language couldn’t be translated right now/,
        ),
      ).toBeInTheDocument();
      expect(await screen.findByText('My bio')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Update translation' }),
      ).toBeInTheDocument();
    },
  );

  it('keeps the text and shows an error when the save itself fails', async () => {
    setup(noBio);
    server.use(
      http.patch(`${API}/me/instructor`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    const { en } = await compose({ en: 'Hi' });
    await userEvent.click(saveButton());
    expect(
      await screen.findByText('Something went wrong.'),
    ).toBeInTheDocument();
    expect(en).toHaveValue('Hi');
  });
});

describe('BioSection existing bio', () => {
  it('shows both saved versions as cards and no writing box', async () => {
    setup(bothBios);
    renderWithProviders(<EditProfilePage />);
    expect(await screen.findByText('Veteran instructor.')).toBeInTheDocument();
    expect(screen.getByText('资深教练。')).toBeInTheDocument();
    expect(screen.getByText('Translated by gemini-test')).toBeInTheDocument();
    expect(within(bioCard()).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('May be out of date')).not.toBeInTheDocument();
  });

  it('Rewrite with AI prefills the preferred language, Clear empties it, and Save replaces both', async () => {
    const { patches } = setup({ ...bothBios, preferredLanguage: 'zh-CN' });
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rewrite with AI' }),
    );
    const box = screen.getByRole('textbox', { name: '中文' });
    expect(box).toHaveValue('资深教练。');
    expect(
      screen.queryByRole('textbox', { name: 'English' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(box).toHaveValue('');
    await userEvent.type(box, '新的简介');
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    await userEvent.click(
      await within(dialog()).findByRole('button', { name: 'Save' }),
    );
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'EN draft',
          bioZh: '中文稿',
          bioEnMachineTranslated: false,
          bioZhMachineTranslated: true,
        },
      ]),
    );
    await waitFor(() =>
      expect(within(bioCard()).queryByRole('textbox')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('EN draft')).toBeInTheDocument();
  });

  it('prefills from the other language when the preferred one is empty, and Cancel hides the box', async () => {
    setup({ ...bothBios, bioEn: null, preferredLanguage: 'en' });
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rewrite with AI' }),
    );
    expect(screen.getByRole('textbox', { name: '中文' })).toHaveValue(
      '资深教练。',
    );
    await userEvent.click(
      within(bioCard()).getByRole('button', { name: 'Cancel' }),
    );
    expect(
      screen.getByRole('button', { name: 'Rewrite with AI' }),
    ).toBeInTheDocument();
  });

  it('edits one card in place and saves only that language as human-written', async () => {
    const { patches } = setup(bothBios);
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit Chinese bio' }),
    );
    const zh = screen.getByRole('textbox', { name: '中文' });
    await userEvent.clear(zh);
    await userEvent.type(zh, '我的简介');
    const bioCard = zh.closest('.flex.flex-col.gap-2') as HTMLElement;
    await userEvent.click(
      within(bioCard).getByRole('button', { name: 'Save' }),
    );
    await waitFor(() =>
      expect(patches).toEqual([
        { bioZh: '我的简介', bioZhMachineTranslated: false },
      ]),
    );
    expect(await screen.findByText('我的简介')).toBeInTheDocument();
    expect(screen.queryByText(/Translated by/)).not.toBeInTheDocument();
  });

  it('machine-translates the other language when editing a card whose other side is empty', async () => {
    const { patches, drafts } = setup(
      { ...bothBios, bioZh: null, bioZhMachineTranslated: false },
      {
        draft: () =>
          HttpResponse.json({
            en: 'New English.',
            zh: '新的英文。',
            sourceLangs: ['en'],
            model: 'gemini-test',
            usage: usage(4),
          }),
      },
    );
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit English bio' }),
    );
    const en = screen.getByRole('textbox', { name: 'English' });
    await userEvent.clear(en);
    await userEvent.type(en, 'New English.');
    await userEvent.click(saveButton());
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'New English.',
          bioEnMachineTranslated: false,
          bioZh: '新的英文。',
          bioZhMachineTranslated: true,
        },
      ]),
    );
    expect(drafts).toEqual([{ text: 'New English.', mode: 'translate' }]);
    expect(await screen.findByText('新的英文。')).toBeInTheDocument();
  });

  it.each([
    {
      lang: 'Chinese',
      box: '中文',
      source: 'Veteran instructor.',
      patch: {
        bioEn: 'Veteran instructor.',
        bioEnMachineTranslated: false,
        bioZh: '中文稿',
        bioZhMachineTranslated: true,
      },
      shown: '中文稿',
    },
    {
      lang: 'English',
      box: 'English',
      source: '资深教练。',
      patch: {
        bioZh: '资深教练。',
        bioZhMachineTranslated: true,
        bioEn: 'EN draft',
        bioEnMachineTranslated: true,
      },
      shown: 'EN draft',
    },
  ])(
    'clearing the saved $lang bio translates it from the other side instead of saving empty',
    async ({ lang, box, source, patch, shown }) => {
      const { patches, drafts } = setup(bothBios);
      renderWithProviders(<EditProfilePage />);
      await userEvent.click(
        await screen.findByRole('button', { name: `Edit ${lang} bio` }),
      );
      await userEvent.clear(screen.getByRole('textbox', { name: box }));
      await userEvent.click(saveButton());
      await waitFor(() => expect(patches).toEqual([patch]));
      expect(drafts).toEqual([{ text: source, mode: 'translate' }]);
      expect(await screen.findByText(shown)).toBeInTheDocument();
      expect(within(bioCard()).queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByText('May be out of date')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Update translation' }),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps the saved bio when clearing it and the translation fails', async () => {
    const { patches, drafts } = setup(bothBios, {
      draft: () => new HttpResponse(null, { status: 503 }),
    });
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit Chinese bio' }),
    );
    const zh = screen.getByRole('textbox', { name: '中文' });
    await userEvent.clear(zh);
    await userEvent.click(saveButton());
    expect(
      await screen.findByText(/This bio wasn’t cleared/),
    ).toBeInTheDocument();
    expect(drafts).toHaveLength(1);
    expect(patches).toHaveLength(0);
    expect(zh).toHaveValue('');
    await userEvent.click(
      within(bioCard()).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.getByText('资深教练。')).toBeInTheDocument();
    expect(
      screen.queryByText(/This bio wasn’t cleared/),
    ).not.toBeInTheDocument();
  });

  it('cancels an in-place edit without saving', async () => {
    const { patches } = setup(bothBios);
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit English bio' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'English' }),
      ' more',
    );
    await userEvent.click(
      within(bioCard()).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.getByText('Veteran instructor.')).toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });
});

describe('BioSection stale warning', () => {
  const zhStale: InstructorProfile = {
    ...bothBios,
    bioEn: 'Updated English.',
    bioEnUpdatedAt: '2026-10-05T00:00:00Z',
    bioZhUpdatedAt: '2026-10-01T00:00:00Z',
  };

  it('Update translation translates the newer side and saves the result', async () => {
    const { patches, drafts } = setup(zhStale, {
      draft: () =>
        HttpResponse.json({
          en: 'Updated English.',
          zh: '更新的中文。',
          sourceLangs: ['en'],
          model: 'gemini-test',
          usage: usage(4),
        }),
    });
    renderWithProviders(<EditProfilePage />);
    expect(await screen.findByText('May be out of date')).toBeInTheDocument();
    expect(screen.getAllByText('May be out of date')).toHaveLength(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Update translation' }),
    );
    expect(
      await within(dialog()).findByText('更新的中文。'),
    ).toBeInTheDocument();
    expect(drafts).toEqual([{ text: 'Updated English.', mode: 'translate' }]);
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Save' }),
    );
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'Updated English.',
          bioZh: '更新的中文。',
          bioEnMachineTranslated: false,
          bioZhMachineTranslated: true,
        },
      ]),
    );
  });

  it('keeps the warning with no requests left, disables the action and still allows hand edits', async () => {
    setup(zhStale, { remaining: 0 });
    renderWithProviders(<EditProfilePage />);
    expect(await screen.findByText('May be out of date')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Update translation' }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByText(/You’ve used all 5 AI requests/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Chinese bio' }),
    );
    expect(screen.getByRole('textbox', { name: '中文' })).toHaveValue(
      '资深教练。',
    );
  });
});

describe('BioSection while a save is translating', () => {
  function heldDraft(after = 0) {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const draft = async () => {
      if (calls++ >= after) await gate;
      return HttpResponse.json({
        en: 'EN draft',
        zh: '中文稿',
        sourceLangs: ['en'],
        model: 'gemini-test',
        usage: usage(4),
      });
    };
    return { draft, release };
  }

  it('locks the composer until the translated save lands', async () => {
    const held = heldDraft();
    const { patches, drafts } = setup(noBio, { draft: held.draft });
    const { en } = await compose({ en: 'I teach skiing' });
    await userEvent.click(saveButton());
    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(en).toBeDisabled();
    expect(langButton('中文')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refine' })).toBeDisabled();
    await userEvent.type(en, ' more');
    expect(en).toHaveValue('I teach skiing');
    held.release();
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'I teach skiing',
          bioEnMachineTranslated: false,
          bioZh: '中文稿',
          bioZhMachineTranslated: true,
        },
      ]),
    );
  });

  it('locks Rewrite, Clear, Cancel and the saved cards while the rewrite saves', async () => {
    const held = heldDraft();
    const { patches } = setup(bothBios, { draft: held.draft });
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rewrite with AI' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('textbox', { name: 'English' })).toBeDisabled();
    expect(langButton('中文')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(
      within(bioCard()).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit English bio' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit Chinese bio' }),
    ).toBeDisabled();
    await userEvent.click(screen.getByText('资深教练。'));
    expect(within(bioCard()).getAllByRole('textbox')).toHaveLength(1);
    held.release();
    await waitFor(() => expect(patches).toHaveLength(1));
    await waitFor(() =>
      expect(within(bioCard()).queryByRole('textbox')).not.toBeInTheDocument(),
    );
  });

  it('locks an in-place edit and the other card while its translation is pending', async () => {
    const held = heldDraft();
    const { patches } = setup(
      { ...bothBios, bioZh: null, bioZhMachineTranslated: false },
      { draft: held.draft },
    );
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit English bio' }),
    );
    const en = screen.getByRole('textbox', { name: 'English' });
    await userEvent.type(en, ' Today.');
    await userEvent.click(saveButton());
    expect(en).toBeDisabled();
    expect(
      within(bioCard()).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit Chinese bio' }),
    ).toBeDisabled();
    await userEvent.type(en, ' Lost?');
    expect(en).toHaveValue('Veteran instructor. Today.');
    held.release();
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'Veteran instructor. Today.',
          bioEnMachineTranslated: false,
          bioZh: '中文稿',
          bioZhMachineTranslated: true,
        },
      ]),
    );
  });

  it('locks the review cards and Back while a cleared card is translated', async () => {
    const held = heldDraft(1);
    const { patches, drafts } = setup(noBio, { draft: held.draft });
    await compose({ en: 'Hello' });
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    await userEvent.click(
      await within(dialog()).findByRole('button', { name: 'Edit Chinese bio' }),
    );
    const zh = within(dialog()).getByRole('textbox', { name: '中文' });
    await userEvent.clear(zh);
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Save' }),
    );
    await waitFor(() => expect(drafts).toHaveLength(2));
    expect(zh).toBeDisabled();
    expect(
      within(dialog()).getByRole('button', { name: 'Edit English bio' }),
    ).toBeDisabled();
    expect(
      within(dialog()).getByRole('button', { name: 'Back' }),
    ).toBeDisabled();
    await userEvent.type(zh, '手写');
    expect(zh).toHaveValue('');
    await userEvent.keyboard('{Escape}');
    expect(dialog()).toBeInTheDocument();
    held.release();
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'EN draft',
          bioEnMachineTranslated: false,
          bioZh: '中文稿',
          bioZhMachineTranslated: true,
        },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});

describe('Save changes with unsaved bio text', () => {
  const UNSAVED =
    'You have unsaved bio changes. Press Save in the bio box to keep them, or discard them.';
  const saveChanges = () =>
    userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  const discard = () =>
    userEvent.click(
      within(bioCard()).getByRole('button', { name: 'Discard bio changes' }),
    );

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('blocks the save and focuses an edited bio card', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { patches } = setup(bothBios);
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit Chinese bio' }),
    );
    const zh = screen.getByRole('textbox', { name: '中文' });
    await userEvent.type(zh, '新的');
    await saveChanges();

    expect(await screen.findByRole('alert')).toHaveTextContent(UNSAVED);
    expect(zh).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
    expect(patches).toHaveLength(0);
  });

  it('blocks the save in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    const { patches } = setup(bothBios);
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: '编辑英文简介' }),
    );
    const en = screen.getByRole('textbox', { name: '英文' });
    await userEvent.clear(en);
    await userEvent.click(screen.getByRole('button', { name: '保存更改' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '简介有未保存的修改。请在简介中点击“保存”保留修改，或放弃修改。',
    );
    expect(en).toHaveFocus();
    expect(
      screen.getByRole('button', { name: '放弃简介修改' }),
    ).toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });

  it('blocks the save while the writing box holds text for Refine', async () => {
    const { patches, drafts } = setup(noBio);
    const { en } = await compose({ en: 'Notes for the AI' });
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    await within(dialog()).findByText('EN draft');
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Back' }),
    );
    await saveChanges();

    expect(await screen.findByRole('alert')).toHaveTextContent(UNSAVED);
    expect(en).toHaveFocus();
    expect(en).toHaveValue('Notes for the AI');
    expect(drafts).toHaveLength(1);
    expect(patches).toHaveLength(0);
  });

  it('blocks the save in Chinese while the writing box holds text', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    const { patches } = setup({ ...noBio, preferredLanguage: 'zh-CN' });
    renderWithProviders(<EditProfilePage />);
    const box = await screen.findByRole('textbox', { name: '中文' });
    await userEvent.type(box, '我教滑雪');
    await userEvent.click(screen.getByRole('button', { name: '保存更改' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '简介有未保存的修改。',
    );
    expect(box).toHaveFocus();
    expect(patches).toHaveLength(0);
  });

  it('keeps the profile fields unsaved until the bio is discarded', async () => {
    const { patches } = setup(bothBios);
    renderWithProviders(<EditProfilePage />);
    const name = await screen.findByDisplayValue('Jane Snow');
    await userEvent.clear(name);
    await userEvent.type(name, 'Janet Snow');
    await userEvent.click(
      screen.getByRole('button', { name: 'Rewrite with AI' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'English' }),
      ' Now on park.',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Chinese bio' }),
    );
    await userEvent.type(screen.getByRole('textbox', { name: '中文' }), '！');
    await saveChanges();

    expect(await screen.findByText(UNSAVED)).toBeInTheDocument();
    expect(screen.getAllByText(UNSAVED)).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: '中文' })).toHaveFocus();
    expect(patches).toHaveLength(0);

    await discard();
    expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
    expect(within(bioCard()).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Veteran instructor.')).toBeInTheDocument();
    expect(screen.getByText('资深教练。')).toBeInTheDocument();

    await saveChanges();
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({ displayNameEn: 'Janet Snow' });
    expect(patches[0]).not.toHaveProperty('bioEn');
    expect(patches[0]).not.toHaveProperty('bioZh');
  });

  it('clears the writing box on discard when there is no bio yet', async () => {
    const { patches } = setup(noBio);
    const { en } = await compose({ en: 'Draft bio' });
    await saveChanges();
    await screen.findByText(UNSAVED);

    await discard();
    expect(en).toHaveValue('');
    expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();

    await saveChanges();
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).not.toHaveProperty('bioEn');
  });

  it('blocks a clear that could not be saved and starts the next edit clean after discard', async () => {
    const { patches } = setup(bothBios, {
      draft: () => new HttpResponse(null, { status: 503 }),
    });
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit Chinese bio' }),
    );
    await userEvent.clear(screen.getByRole('textbox', { name: '中文' }));
    await userEvent.click(saveButton());
    await screen.findByText(/This bio wasn’t cleared/);
    await saveChanges();
    expect(await screen.findByText(UNSAVED)).toBeInTheDocument();

    await discard();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Chinese bio' }),
    );
    expect(screen.getByRole('textbox', { name: '中文' })).toHaveValue(
      '资深教练。',
    );
    expect(
      screen.queryByText(/This bio wasn’t cleared/),
    ).not.toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });

  it('saves normally once the bio itself is saved', async () => {
    const { patches } = setup(bothBios);
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit English bio' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'English' }),
      ' Today.',
    );
    await saveChanges();
    await screen.findByText(UNSAVED);

    await userEvent.click(saveButton());
    await waitFor(() =>
      expect(patches).toEqual([
        { bioEn: 'Veteran instructor. Today.', bioEnMachineTranslated: false },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument(),
    );

    await saveChanges();
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]).not.toHaveProperty('bioEn');
  });

  it('does not block when the open bio boxes match the saved bio', async () => {
    const { patches } = setup(bothBios);
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit English bio' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Rewrite with AI' }),
    );
    expect(within(bioCard()).getAllByRole('textbox')).toHaveLength(2);
    await saveChanges();

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
  });

  it('drops the message once the text matches the saved bio again', async () => {
    const { patches } = setup(bothBios);
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit English bio' }),
    );
    const en = screen.getByRole('textbox', { name: 'English' });
    await userEvent.type(en, '!');
    await saveChanges();
    await screen.findByText(UNSAVED);

    await userEvent.type(en, '{Backspace}');
    expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
    await userEvent.type(en, '?');
    expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
    expect(patches).toHaveLength(0);
  });
});

describe('bio helpers', () => {
  it('takes the written languages from the request, else from the draft', () => {
    const draft = {
      en: 'a',
      zh: 'b',
      model: null,
      sourceLangs: ['en', 'zh-CN'],
    } as never;
    expect(
      writtenLangs({ text: 'x', mode: 'translate', source: 'zh' }, draft),
    ).toEqual(['zh']);
    expect(writtenLangs({ text: 'x', mode: 'refine' }, draft)).toEqual([
      'en',
      'zh',
    ]);
    expect(writtenLangs({ text: 'x', mode: 'refine' })).toEqual([]);
  });

  it('marks the older side stale, null only when the other side is newer', () => {
    const base = { ...bothBios };
    expect(staleSide(base)).toBeNull();
    expect(
      staleSide({ ...base, bioEnUpdatedAt: null, bioZhUpdatedAt: null }),
    ).toBeNull();
    expect(staleSide({ ...base, bioEnUpdatedAt: null })).toBe('en');
    expect(staleSide({ ...base, bioZhUpdatedAt: '2026-10-02T00:00:00Z' })).toBe(
      'en',
    );
    expect(staleSide({ ...base, bioEnUpdatedAt: '2026-10-02T00:00:00Z' })).toBe(
      'zh',
    );
    expect(
      staleSide({ ...base, bioEn: '', bioEnUpdatedAt: '2026-10-02T00:00:00Z' }),
    ).toBeNull();
  });
});
