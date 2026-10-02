import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReferenceManagerPage } from './ReferenceManagerPage';
import { renderWithProviders } from '@/test/render';
import type { ReferenceRecord } from '@/lib/types';

const rows: ReferenceRecord[] = [
  {
    id: 'r1',
    key: 'loc.whistler',
    name: 'Whistler',
    sortOrder: 0,
    isActive: true,
  },
  {
    id: 'r2',
    key: 'loc.cypress',
    name: 'Cypress',
    sortOrder: 1,
    isActive: false,
  },
];

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const addMutateAsync = vi.fn();
const usageCalls: Array<string | null> = [];
let instructorCount = 3;

vi.mock('./api', () => ({
  useAdminReferences: () => ({ data: rows, isLoading: false }),
  useAddReference: () => ({
    mutateAsync: addMutateAsync,
    isPending: false,
    isSuccess: false,
  }),
  useUpdateReference: () => ({
    mutate: updateMutate,
    isPending: false,
    isError: false,
  }),
  useReferenceUsage: (_slug: string, id: string | null) => {
    usageCalls.push(id);
    return {
      data: { instructorCount },
      isLoading: false,
      isSuccess: true,
      isError: false,
    };
  },
  useDeleteReference: () => ({
    mutate: deleteMutate,
    isPending: false,
    isError: false,
  }),
}));

function rowFor(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

describe('ReferenceManagerPage', () => {
  beforeEach(() => {
    updateMutate.mockReset();
    deleteMutate.mockReset();
    addMutateAsync.mockReset();
    usageCalls.length = 0;
    instructorCount = 3;
  });

  it('lists inactive rows alongside active ones with their status', () => {
    renderWithProviders(<ReferenceManagerPage />);
    expect(within(rowFor('Whistler')).getByText('Active')).toBeInTheDocument();
    expect(within(rowFor('Cypress')).getByText('Inactive')).toBeInTheDocument();
  });

  it('deactivates an active row and activates an inactive one', async () => {
    renderWithProviders(<ReferenceManagerPage />);
    await userEvent.click(
      within(rowFor('Whistler')).getByRole('button', { name: 'Deactivate' }),
    );
    expect(updateMutate).toHaveBeenLastCalledWith({
      id: 'r1',
      isActive: false,
    });
    await userEvent.click(
      within(rowFor('Cypress')).getByRole('button', { name: 'Activate' }),
    );
    expect(updateMutate).toHaveBeenLastCalledWith({ id: 'r2', isActive: true });
  });

  it('shows the usage count and deletes only after confirming', async () => {
    renderWithProviders(<ReferenceManagerPage />);
    await userEvent.click(
      within(rowFor('Whistler')).getByRole('button', { name: 'Remove' }),
    );
    const dialog = screen.getByRole('alertdialog');
    expect(usageCalls).toContain('r1');
    expect(dialog).toHaveTextContent(/can’t be undone/);
    expect(dialog).toHaveTextContent(
      'It will be removed from 3 instructor profiles.',
    );
    expect(deleteMutate).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove permanently' }),
    );
    expect(deleteMutate).toHaveBeenCalledWith('r1', expect.anything());
  });

  it('omits the instructor line when the value is unused', async () => {
    instructorCount = 0;
    renderWithProviders(<ReferenceManagerPage />);
    await userEvent.click(
      within(rowFor('Cypress')).getByRole('button', { name: 'Remove' }),
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(/can’t be undone/);
    expect(dialog).not.toHaveTextContent(/instructor profiles/);
  });

  it('cancelling the confirmation deletes nothing', async () => {
    renderWithProviders(<ReferenceManagerPage />);
    await userEvent.click(
      within(rowFor('Whistler')).getByRole('button', { name: 'Remove' }),
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('adds a row with the entered values', async () => {
    addMutateAsync.mockResolvedValue(rows[0]);
    renderWithProviders(<ReferenceManagerPage />);
    await userEvent.type(screen.getByLabelText(/^Key/), ' loc.blackcomb ');
    await userEvent.type(screen.getByLabelText(/^Name/), 'Blackcomb');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addMutateAsync).toHaveBeenCalledWith({
      key: 'loc.blackcomb',
      name: 'Blackcomb',
      sortOrder: 0,
      isActive: true,
    });
  });
});
