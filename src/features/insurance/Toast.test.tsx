import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Modal } from '@/components';
import { renderWithProviders } from '@/test/render';
import { useToast } from './Toast';

function Page() {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(false);
  const { toast, showToast } = useToast();
  return (
    <>
      <button type="button" onClick={() => showToast('Saved')}>
        Save
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Modal title="Edit" onClose={() => setOpen(false)}>
          <button type="button" onClick={() => showToast('Updated')}>
            Update
          </button>
          <button type="button" onClick={() => setInner(true)}>
            More
          </button>
        </Modal>
      )}
      {inner && (
        <Modal title="More" onClose={() => setInner(false)}>
          <input aria-label="Detail" />
        </Modal>
      )}
      {toast}
    </>
  );
}

describe('useToast with an open dialog', () => {
  it('keeps a toast shown before the dialog opened announced while the page behind is inert', async () => {
    renderWithProviders(<Page />);
    const open = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const saved = screen.getByRole('status');
    await userEvent.click(open);

    const dialog = screen.getByRole('dialog', { name: 'Edit' });
    expect(open.closest('[inert]')).not.toBeNull();
    expect(dialog.closest('[inert]')).toBeNull();
    expect(saved).toBeInTheDocument();
    expect(saved).toHaveTextContent('Saved');
    expect(saved.closest('[inert]')).toBeNull();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Update' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Updated');
    expect(screen.getByRole('status').closest('[inert]')).toBeNull();
    expect(open.closest('[inert]')).not.toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(dialog).not.toBeInTheDocument();
    expect(open.closest('[inert]')).toBeNull();
    expect(screen.getByRole('status').closest('[inert]')).toBeNull();
  });

  it('keeps a toast shown inside a dialog announced when another dialog opens on top', async () => {
    renderWithProviders(<Page />);
    const open = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(open);
    const outer = screen.getByRole('dialog', { name: 'Edit' });
    await userEvent.click(
      within(outer).getByRole('button', { name: 'Update' }),
    );
    const updated = screen.getByRole('status');
    expect(updated).toHaveTextContent('Updated');
    expect(updated.closest('[inert]')).toBeNull();
    expect(open.closest('[inert]')).not.toBeNull();

    await userEvent.click(within(outer).getByRole('button', { name: 'More' }));
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument();
    expect(outer.closest('[inert]')).not.toBeNull();
    expect(open.closest('[inert]')).not.toBeNull();
    expect(updated).toBeInTheDocument();
    expect(updated.closest('[inert]')).toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(outer.closest('[inert]')).toBeNull();
    expect(open.closest('[inert]')).not.toBeNull();
    expect(updated.closest('[inert]')).toBeNull();
  });
});
