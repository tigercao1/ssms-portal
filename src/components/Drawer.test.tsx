import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from './Drawer';

function DraftPage({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Drawer
          title="Draft"
          blocked
          onClose={onClose}
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              Send
            </button>
          }
        >
          <input aria-label="Lessons" />
        </Drawer>
      )}
    </>
  );
}

describe('Drawer', () => {
  it('keeps the side-panel width by default', () => {
    renderWithProviders(
      <Drawer title="Draft" onClose={vi.fn()}>
        body
      </Drawer>,
    );
    const panel = screen.getByRole('dialog', { name: 'Draft' });
    expect(panel).toHaveClass('w-[min(580px,100vw)]');
    expect(panel).not.toHaveClass('w-full');
  });

  it('spans the viewport when fullWidth', () => {
    renderWithProviders(
      <Drawer title="Filters" fullWidth onClose={vi.fn()}>
        body
      </Drawer>,
    );
    const panel = screen.getByRole('dialog', { name: 'Filters' });
    expect(panel).toHaveClass('w-full');
    expect(panel).not.toHaveClass('w-[min(580px,100vw)]');
  });

  it('keeps Tab inside, ignores Escape while blocked and returns focus', async () => {
    const onClose = vi.fn();
    renderWithProviders(<DraftPage onClose={onClose} />);
    const open = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(open);
    const panel = screen.getByRole('dialog', { name: 'Draft' });
    expect(panel).toHaveFocus();
    expect(open.closest('[inert]')).not.toBeNull();

    for (let i = 0; i < 8; i++) {
      await userEvent.tab({ shift: i % 3 === 0 });
      expect(panel).toContainElement(document.activeElement as HTMLElement);
    }
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(open.closest('[inert]')).toBeNull();
    expect(open).toHaveFocus();
  });
});
