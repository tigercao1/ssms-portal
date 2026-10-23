import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { Modal } from './Modal';

function Page({ nested = false }: { nested?: boolean }) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      {open && (
        <Modal
          title="Edit"
          onClose={() => setOpen(false)}
          footer={<button type="button">Done</button>}
        >
          <input aria-label="Name" />
          {nested && (
            <button type="button" onClick={() => setInner(true)}>
              More
            </button>
          )}
        </Modal>
      )}
      {inner && (
        <Modal title="More" onClose={() => setInner(false)}>
          <input aria-label="Detail" />
        </Modal>
      )}
    </>
  );
}

describe('Modal focus', () => {
  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    renderWithProviders(<Page />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    const done = within(dialog).getByRole('button', { name: 'Done' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(name).toHaveFocus();

    await userEvent.tab();
    expect(done).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(name).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(done).toHaveFocus();

    for (let i = 0; i < 10; i++) {
      await userEvent.tab({ shift: i % 3 === 0 });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('makes the page behind inert, closes on Escape and returns focus to the opener', async () => {
    renderWithProviders(<Page />);
    const open = screen.getByRole('button', { name: 'Open' });
    const behind = screen.getByRole('button', { name: 'Behind' });
    open.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(behind.closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(behind.closest('[inert]')).toBeNull();
    expect(open).toHaveFocus();
  });

  it('lets only the top dialog take Tab and Escape when stacked', async () => {
    renderWithProviders(<Page nested />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const outer = screen.getByRole('dialog', { name: 'Edit' });
    const more = within(outer).getByRole('button', { name: 'More' });
    await userEvent.click(more);
    const inner = screen.getByRole('dialog', { name: 'More' });
    expect(within(inner).getByRole('textbox')).toHaveFocus();
    expect(outer.closest('[inert]')).not.toBeNull();

    for (let i = 0; i < 6; i++) {
      await userEvent.tab({ shift: i % 2 === 1 });
      expect(inner).toContainElement(document.activeElement as HTMLElement);
    }

    await userEvent.keyboard('{Escape}');
    expect(inner).not.toBeInTheDocument();
    expect(outer).toBeInTheDocument();
    expect(outer.closest('[inert]')).toBeNull();
    expect(more).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(outer).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });
});
