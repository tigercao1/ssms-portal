import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ReferenceManagerPage } from './ReferenceManagerPage';

const API = 'http://localhost:3000';
const rows = [
  { id: 'r1', key: 'loc.whistler', name: 'Whistler', sortOrder: 0, isActive: true },
];

describe('ReferenceManagerPage remove confirmation', () => {
  it('reopening waits for a fresh usage count before allowing delete', async () => {
    let usageHits = 0;
    let releaseSecond: () => void = () => {};
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const deletes: string[] = [];
    server.use(
      http.get(`${API}/admin/reference/teaching-locations`, () =>
        HttpResponse.json(rows),
      ),
      http.get(`${API}/admin/reference/teaching-locations/r1/usage`, async () => {
        usageHits += 1;
        if (usageHits === 1) return HttpResponse.json({ instructorCount: 3 });
        await secondGate;
        return HttpResponse.json({ instructorCount: 7 });
      }),
      http.delete(`${API}/admin/reference/teaching-locations/r1`, ({ request }) => {
        deletes.push(request.url);
        return HttpResponse.json({ ...rows[0], instructorCount: 7 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    let dialog = screen.getByRole('alertdialog');
    await within(dialog).findByText(
      'It will be removed from 3 instructor profiles.',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Remove permanently' }),
    ).toBeEnabled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    dialog = screen.getByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', {
      name: 'Remove permanently',
    });
    expect(dialog).not.toHaveTextContent(/3 instructor profiles/);
    expect(within(dialog).getByRole('status')).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    await waitFor(() => expect(usageHits).toBe(2));
    await user.click(confirm);
    expect(dialog).not.toHaveTextContent(/3 instructor profiles/);
    expect(deletes).toHaveLength(0);

    releaseSecond();
    await within(dialog).findByText(
      'It will be removed from 7 instructor profiles.',
    );
    expect(dialog).not.toHaveTextContent(/3 instructor profiles/);
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() => expect(deletes).toHaveLength(1));
  });
});
