import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ReminderSettingsCard } from './ReminderSettingsCard';
import type { ReminderSettings } from './reminderSettings';

const API = 'http://localhost:3000';
const URL = `${API}/admin/booking/reminder-settings`;

const defaults: ReminderSettings = {
  enabled: true,
  offsetsMinutes: [1440, 60],
  enabledAt: '2026-11-19T08:30:00Z',
  updatedAt: '2026-11-19T08:30:00Z',
};

function serve(
  initial: ReminderSettings = defaults,
  reply?: (body: unknown) => Response,
) {
  const puts: unknown[] = [];
  let current = initial;
  server.use(
    http.get(URL, () => HttpResponse.json(current)),
    http.put(URL, async ({ request }) => {
      const body = (await request.json()) as {
        enabled: boolean;
        offsetsMinutes: number[];
      };
      puts.push(body);
      if (reply) return reply(body);
      current = {
        ...current,
        ...body,
        offsetsMinutes: [...body.offsetsMinutes].sort((a, b) => b - a),
        enabledAt:
          body.enabled && !current.enabled
            ? '2026-11-20T14:05:00Z'
            : current.enabledAt,
        updatedAt: '2026-11-20T14:05:00Z',
      };
      return HttpResponse.json(current);
    }),
  );
  return puts;
}

const amount = (n: number) =>
  screen.getByRole('spinbutton', { name: `Reminder ${n}: how long before` });
const unit = (n: number) =>
  screen.getByRole('combobox', { name: `Reminder ${n}: unit` });

async function renderCard() {
  renderWithProviders(<ReminderSettingsCard />);
  await screen.findByRole('switch', { name: 'Send reminder emails' });
}

describe('ReminderSettingsCard', () => {
  it('shows the saved reminder times in days, hours and minutes and when they were turned on', async () => {
    serve({ ...defaults, offsetsMinutes: [2880, 120, 45] });
    await renderCard();

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(amount(1)).toHaveValue(2);
    expect(unit(1)).toHaveValue('days');
    expect(amount(2)).toHaveValue(2);
    expect(unit(2)).toHaveValue('hours');
    expect(amount(3)).toHaveValue(45);
    expect(unit(3)).toHaveValue('minutes');
    expect(screen.getByTestId('reminders-status')).toHaveTextContent(
      /^On since Nov\.? 19, 2026, 0?3:30 a\.m\. \(Toronto time\)$/,
    );
  });

  it('adds, converts and removes reminder times and saves them in minutes', async () => {
    const puts = serve();
    const user = userEvent.setup();
    await renderCard();

    await user.click(
      screen.getByRole('button', { name: 'Add a reminder time' }),
    );
    await user.type(amount(3), '90');
    await user.selectOptions(unit(3), 'minutes');
    await user.clear(amount(1));
    await user.type(amount(1), '3');
    await user.click(screen.getByRole('button', { name: 'Remove reminder 2' }));
    await user.click(screen.getByRole('button', { name: 'Save reminders' }));

    expect(await screen.findByText('Reminders saved.')).toBeVisible();
    expect(puts).toEqual([{ enabled: true, offsetsMinutes: [4320, 90] }]);
    expect(amount(1)).toHaveValue(3);
    expect(unit(1)).toHaveValue('days');
    expect(amount(2)).toHaveValue(90);
    expect(unit(2)).toHaveValue('minutes');
  });

  it('allows at most five reminder times', async () => {
    serve({ ...defaults, offsetsMinutes: [2880, 1440, 120, 60] });
    const user = userEvent.setup();
    await renderCard();
    const add = screen.getByRole('button', { name: 'Add a reminder time' });

    await user.click(add);

    expect(screen.getAllByRole('spinbutton')).toHaveLength(5);
    expect(add).toBeDisabled();
  });

  it('asks for whole numbers before saving', async () => {
    const puts = serve();
    const user = userEvent.setup();
    await renderCard();

    await user.clear(amount(2));
    await user.type(amount(2), '1.5');
    await user.click(screen.getByRole('button', { name: 'Save reminders' }));

    expect(
      screen.getByText('Enter a whole number for each reminder time.'),
    ).toBeVisible();
    expect(amount(2)).toHaveAttribute('aria-invalid', 'true');
    expect(puts).toEqual([]);
  });

  it('shows the validation errors the API returns', async () => {
    serve(defaults, () =>
      HttpResponse.json(
        {
          message: [
            'Each reminder time must be different',
            'Each reminder time must be a whole number of minutes from 15 (15 minutes) to 20160 (14 days) before the lesson',
            'Something new',
          ],
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    await renderCard();

    await user.clear(amount(1));
    await user.type(amount(1), '60');
    await user.selectOptions(unit(1), 'minutes');
    await user.click(screen.getByRole('button', { name: 'Save reminders' }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('Each reminder time must be different.'),
    ).toBeVisible();
    expect(
      within(alert).getByText(
        'Each reminder time must be from 15 minutes to 14 days before the lesson.',
      ),
    ).toBeVisible();
    expect(within(alert).getByText('Something new')).toBeVisible();
  });

  it('shows the API message when reminders are on with no times', async () => {
    serve(defaults, () =>
      HttpResponse.json(
        {
          message: 'Add at least one reminder time, or turn reminders off',
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    await renderCard();

    await user.click(screen.getByRole('button', { name: 'Remove reminder 2' }));
    await user.click(screen.getByRole('button', { name: 'Remove reminder 1' }));
    expect(screen.getByText('No reminder times yet.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save reminders' }));

    expect(
      await screen.findByText(
        'Add at least one reminder time, or turn reminders off.',
      ),
    ).toBeVisible();
  });

  it('turns reminders off and on again', async () => {
    const puts = serve();
    const user = userEvent.setup();
    await renderCard();

    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Save reminders' }));
    await waitFor(() =>
      expect(screen.getByTestId('reminders-status')).toHaveTextContent('Off'),
    );

    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Save reminders' }));
    await waitFor(() =>
      expect(screen.getByTestId('reminders-status')).toHaveTextContent(
        /On since Nov\.? 20, 2026, 0?9:05 a\.m\./,
      ),
    );
    expect(puts).toEqual([
      { enabled: false, offsetsMinutes: [1440, 60] },
      { enabled: true, offsetsMinutes: [1440, 60] },
    ]);
  });

  it('renders in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve();
    renderWithProviders(<ReminderSettingsCard />);

    expect(
      await screen.findByRole('heading', { name: '课程提醒' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('switch', { name: '发送提醒邮件' }),
    ).toBeVisible();
    expect(screen.getByRole('combobox', { name: '提醒 1：单位' })).toHaveValue(
      'days',
    );
    expect(screen.getByTestId('reminders-status')).toHaveTextContent(
      /^自 .+ 起开启（多伦多时间）$/,
    );
    expect(screen.getByRole('button', { name: '添加提醒时间' })).toBeVisible();
  });
});
