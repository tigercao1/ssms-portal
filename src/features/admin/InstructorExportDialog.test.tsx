import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { AdminListPage } from './AdminListPage';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw';
import { todayIso } from '@/features/documents/api/validity';

const API = 'http://localhost:3000';
const CSV =
  '\uFEFFName,Email,Phone,Date of Birth,Certifications,MSLM Podium Pass Holder\r\n' +
  'Jane Doe,jane@example.com,,1990-04-05,CSIA Level 3,TRUE\r\n';
const ALL_STAGES = [
  'pending',
  'rejected',
  'deactivated',
  'onboarding',
  'in_review',
  'going_live',
  'live',
];

interface ExportRequest {
  stage: string[];
  onboarding: string | null;
  other: string[];
}

let exports: ExportRequest[] = [];
let blobs: Blob[] = [];
let click: ReturnType<typeof vi.spyOn>;

function serveExport({
  nonAsciiNames = '0',
  status = 200,
}: { nonAsciiNames?: string; status?: number } = {}) {
  exports = [];
  server.use(
    http.get(`${API}/admin/instructors/export.csv`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      exports.push({
        stage: params.getAll('stage'),
        onboarding: params.get('onboarding'),
        other: [...params.keys()].filter(
          (key) => key !== 'stage' && key !== 'onboarding',
        ),
      });
      if (status !== 200) {
        return HttpResponse.json({ message: 'Forbidden resource' }, { status });
      }
      return new HttpResponse(CSV.slice(1), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'X-Export-Non-Ascii-Names': nonAsciiNames,
        },
      });
    }),
  );
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  blobs = [];
  Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:instructors';
    }),
    revokeObjectURL: vi.fn(),
  });
  click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
});

afterEach(() => {
  click.mockRestore();
  vi.unstubAllGlobals();
});

async function openExport(
  user: ReturnType<typeof userEvent.setup>,
  name = 'Export CSV',
) {
  await user.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog');
}

const checkedStages = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('checkbox')
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => box.closest('label')?.textContent);

describe('Export CSV on the instructor list', () => {
  it('downloads every stage by default as instructors-<today>.csv with a BOM', async () => {
    serveExport();
    const user = userEvent.setup();
    renderWithProviders(<AdminListPage />);

    const dialog = await openExport(user);
    expect(dialog).toHaveAccessibleName('Export instructors');
    expect(checkedStages(dialog)).toEqual([
      'Pending',
      'Rejected',
      'Inactive',
      'Onboarding',
      'In review',
      'Going live',
      'Live',
    ]);
    expect(
      within(dialog).getByRole('combobox', { name: 'Onboarding' }),
    ).toHaveValue('any');

    await user.click(within(dialog).getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(exports).toEqual([
      { stage: ALL_STAGES, onboarding: null, other: [] },
    ]);
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(`instructors-${todayIso()}.csv`);
    const bytes = await bytesOf(blobs[0] as Blob);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe(CSV.slice(1));
    expect(
      await within(dialog).findByText(
        `Downloaded instructors-${todayIso()}.csv.`,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/non-English/)).not.toBeInTheDocument();
  });

  it('starts from the list’s stage filter and sends the onboarding choice', async () => {
    serveExport();
    const user = userEvent.setup();
    renderWithProviders(<AdminListPage />, {
      route: '/?stage=live&stage=in_review&calendar=true&q=jane',
    });

    const dialog = await openExport(user);
    expect(checkedStages(dialog)).toEqual(['In review', 'Live']);
    await user.click(within(dialog).getByLabelText('Going live'));
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Onboarding' }),
      'Completed',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(exports).toHaveLength(1));

    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Onboarding' }),
      'Not completed',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(exports).toHaveLength(2));

    expect(exports).toEqual([
      {
        stage: ['in_review', 'going_live', 'live'],
        onboarding: 'complete',
        other: [],
      },
      {
        stage: ['in_review', 'going_live', 'live'],
        onboarding: 'incomplete',
        other: [],
      },
    ]);
  });

  it('shows how many names have non-English characters', async () => {
    serveExport({ nonAsciiNames: '3' });
    const user = userEvent.setup();
    renderWithProviders(<AdminListPage />);

    const dialog = await openExport(user);
    await user.click(within(dialog).getByRole('button', { name: 'Download' }));

    expect(
      await within(dialog).findByText(
        'Some names have non-English characters (3). They are exported as entered.',
      ),
    ).toBeInTheDocument();
  });

  it('needs at least one stage before it downloads', async () => {
    serveExport();
    const user = userEvent.setup();
    renderWithProviders(<AdminListPage />, { route: '/?stage=live' });

    const dialog = await openExport(user);
    await user.click(within(dialog).getByLabelText('Live'));

    expect(
      within(dialog).getByText('Choose at least one status.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Download' }),
    ).toBeDisabled();
    expect(exports).toEqual([]);
  });

  it('shows the API error and saves nothing when the download fails', async () => {
    serveExport({ status: 403 });
    const user = userEvent.setup();
    renderWithProviders(<AdminListPage />);

    const dialog = await openExport(user);
    await user.click(within(dialog).getByRole('button', { name: 'Download' }));

    expect(
      await within(dialog).findByText(
        'Could not download the CSV: Forbidden resource',
      ),
    ).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
  });

  it('closes on Escape and gives focus back to the button', async () => {
    serveExport();
    const user = userEvent.setup();
    renderWithProviders(<AdminListPage />);

    const dialog = await openExport(user);
    expect(within(dialog).getAllByRole('checkbox')[0]).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toHaveFocus();
  });

  it('is fully translated in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveExport({ nonAsciiNames: '2' });
    const user = userEvent.setup();
    renderWithProviders(<AdminListPage />);

    const dialog = await openExport(user, '导出 CSV');
    expect(dialog).toHaveAccessibleName('导出教练');
    expect(
      within(dialog).getByRole('group', { name: '状态' }),
    ).toBeInTheDocument();
    const onboarding = within(dialog).getByRole('combobox', {
      name: '入职资料',
    });
    expect(
      within(onboarding)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['不限', '已完成', '未完成']);
    await user.click(within(dialog).getByRole('button', { name: '下载' }));

    expect(
      await within(dialog).findByText(`已下载 instructors-${todayIso()}.csv。`),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('部分姓名含非英文字符（2 个），已按原样导出。'),
    ).toBeInTheDocument();
  });
});
