import { describe, expect, it } from 'vitest';
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
      current = { ...current, ...body } as InstructorProfile;
      return HttpResponse.json(current);
    }),
  );
  return { patches, drafts };
}

async function compose(text: string) {
  renderWithProviders(<EditProfilePage />);
  const box = await screen.findByRole('textbox', {
    name: 'Write about yourself',
  });
  await userEvent.type(box, text);
  return box;
}

const bioCard = () =>
  screen.getByRole('heading', { name: 'Bio' }).parentElement as HTMLElement;
const dialog = () => screen.getByRole('dialog', { name: 'Review your bio' });

describe('BioSection first-time flow', () => {
  it('shows one writing box with the daily count and no per-language fields', async () => {
    setup(noBio, { remaining: 3 });
    renderWithProviders(<EditProfilePage />);
    expect(
      await screen.findByRole('textbox', { name: 'Write about yourself' }),
    ).toHaveAttribute('maxLength', '2000');
    expect(
      screen.getByText(/one language is enough. You can mix both/),
    ).toBeInTheDocument();
    expect(await screen.findByText('3 of 5 left today')).toBeInTheDocument();
    expect(screen.queryByLabelText('Bio (English)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refine' })).toBeDisabled();
  });

  it('refines English text and marks only the translated side as machine-translated', async () => {
    const { patches, drafts } = setup(noBio, {
      draft: async () => {
        await delay(50);
        return HttpResponse.json({
          en: 'Polished.',
          zh: '润色。',
          sourceLangs: ['en'],
          model: 'gemini-test',
          usage: usage(4),
        });
      },
    });
    await compose('I teach skiing');
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

  it('uses Chinese text as written and flags the English translation', async () => {
    const { patches, drafts } = setup(noBio, {
      draft: () =>
        HttpResponse.json({
          en: 'I am a coach.',
          zh: '我是教练。',
          sourceLangs: ['zh-CN'],
          model: 'gemini-test',
          usage: usage(4),
        }),
    });
    await compose('我是教练。');
    await userEvent.click(
      screen.getByRole('button', { name: 'Use as written' }),
    );
    expect(
      await within(dialog()).findByText('I am a coach.'),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Save' }),
    );
    await waitFor(() =>
      expect(patches).toEqual([
        {
          bioEn: 'I am a coach.',
          bioZh: '我是教练。',
          bioEnMachineTranslated: true,
          bioZhMachineTranslated: false,
        },
      ]),
    );
    expect(drafts).toEqual([{ text: '我是教练。', mode: 'translate' }]);
  });

  it('flags neither side when the instructor wrote both languages', async () => {
    const { patches } = setup(noBio, {
      draft: () =>
        HttpResponse.json({
          en: 'I teach beginner skiers. I also teach snowboard.',
          zh: '我教初学者滑雪。我也教单板。',
          sourceLangs: ['en', 'zh-CN'],
          model: 'gemini-test',
          usage: usage(4),
        }),
    });
    await compose('I teach beginner skiers. 我也教单板。');
    await userEvent.click(
      screen.getByRole('button', { name: 'Use as written' }),
    );
    await within(dialog()).findByText('我教初学者滑雪。我也教单板。');
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Save' }),
    );
    await waitFor(() =>
      expect(patches).toEqual([
        expect.objectContaining({
          bioEnMachineTranslated: false,
          bioZhMachineTranslated: false,
        }),
      ]),
    );
  });

  it('drops the machine flag when the translation is edited by hand', async () => {
    const { patches } = setup(noBio);
    await compose('Hello there');
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

  it('opens the card for editing when the card itself is clicked', async () => {
    setup(noBio);
    await compose('Hello');
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    await userEvent.click(await within(dialog()).findByText('EN draft'));
    expect(
      within(dialog()).getByRole('textbox', { name: 'English' }),
    ).toHaveValue('EN draft');
  });

  it('Back closes the modal, saves nothing and keeps the text', async () => {
    const { patches } = setup(noBio);
    const box = await compose('Keep me');
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    await within(dialog()).findByText('EN draft');
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Back' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(box).toHaveValue('Keep me');
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
    const box = await compose('My bio');
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
    expect(box).toHaveValue('My bio');
    expect(screen.getByText('0 of 5 left today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refine' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Use as written' }),
    ).toBeDisabled();
    expect(screen.getByText(/Try again after/)).toBeInTheDocument();
  });

  it('says AI is unavailable on 503 and keeps the text', async () => {
    setup(noBio, {
      draft: () =>
        HttpResponse.json({ code: 'bio_ai_unavailable' }, { status: 503 }),
    });
    const box = await compose('My bio');
    await userEvent.click(
      screen.getByRole('button', { name: 'Use as written' }),
    );
    expect(
      await within(dialog()).findByText(/AI is unavailable right now/),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(box).toHaveValue('My bio');
    expect(screen.getByRole('button', { name: 'Refine' })).toBeEnabled();
  });

  it('falls back to a generic error for anything else', async () => {
    setup(noBio, { draft: () => HttpResponse.json({}, { status: 500 }) });
    await compose('My bio');
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }));
    expect(
      await within(dialog()).findByText('Something went wrong.'),
    ).toBeInTheDocument();
  });
});

describe('BioSection existing bio', () => {
  it('shows both saved versions as cards and no writing box', async () => {
    setup(bothBios);
    renderWithProviders(<EditProfilePage />);
    expect(await screen.findByText('Veteran instructor.')).toBeInTheDocument();
    expect(screen.getByText('资深教练。')).toBeInTheDocument();
    expect(screen.getByText('Translated by gemini-test')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Write about yourself' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('May be out of date')).not.toBeInTheDocument();
  });

  it('Rewrite with AI prefills the preferred language, Clear empties it, and Save replaces both', async () => {
    const { patches } = setup({ ...bothBios, preferredLanguage: 'zh-CN' });
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rewrite with AI' }),
    );
    const box = screen.getByRole('textbox', { name: 'Write about yourself' });
    expect(box).toHaveValue('资深教练。');
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(box).toHaveValue('');
    await userEvent.type(box, 'New text');
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
      expect(
        screen.queryByRole('textbox', { name: 'Write about yourself' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('EN draft')).toBeInTheDocument();
  });

  it('prefills from the other language when the preferred one is empty, and Cancel hides the box', async () => {
    setup({ ...bothBios, bioEn: null, preferredLanguage: 'en' });
    renderWithProviders(<EditProfilePage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rewrite with AI' }),
    );
    expect(
      screen.getByRole('textbox', { name: 'Write about yourself' }),
    ).toHaveValue('资深教练。');
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
