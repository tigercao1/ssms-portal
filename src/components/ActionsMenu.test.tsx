import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render';
import { translateText } from '@/test/translate';
import {
  ActionsMenu,
  RowActions,
  placeMenu,
  type ActionsMenuItem,
} from './ActionsMenu';

function setup(items: ActionsMenuItem[], label?: string) {
  const user = userEvent.setup();
  renderWithProviders(
    <>
      <button type="button">Before</button>
      <ActionsMenu items={items} label={label} />
      <button type="button">After</button>
    </>,
  );
  return {
    user,
    trigger: screen.getByRole('button', { name: label ?? 'More actions' }),
  };
}

const edit = vi.fn();
const remove = vi.fn();
const basic: ActionsMenuItem[] = [
  { key: 'edit', label: 'Edit', onSelect: edit },
  { key: 'archive', label: 'Archive', disabled: true, description: 'Locked' },
  { key: 'remove', label: 'Remove', destructive: true, onSelect: remove },
];

describe('ActionsMenu', () => {
  it('opens on click into a portal menu and runs the chosen item', async () => {
    edit.mockClear();
    const { user, trigger } = setup(basic, 'More actions for Row 1');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'More actions for Row 1' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    expect(menu.parentElement).toBe(document.body);
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['Edit', 'ArchiveLocked', 'Remove']);
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();

    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(edit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders a file item as a label for its file input and runs it once a file is chosen', async () => {
    const onChange = vi.fn();
    const scripted = vi.spyOn(HTMLInputElement.prototype, 'click');
    const { user, trigger } = setup([
      { key: 'edit', label: 'Edit', onSelect: edit },
      {
        key: 'upload',
        label: 'Upload PDF',
        file: { accept: 'application/pdf', inputLabel: 'PDF file', onChange },
      },
    ]);
    await user.click(trigger);
    const item = screen.getByRole('menuitem', { name: 'Upload PDF' });
    const input = screen.getByLabelText('PDF file');
    expect(item.tagName).toBe('LABEL');
    expect(item).toContainElement(input);
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'application/pdf');
    expect(input).toHaveClass('sr-only');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveFocus();

    const file = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    await user.upload(input, file);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.files[0]).toBe(file);
    expect(scripted).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    scripted.mockRestore();
  });

  it('opens from the keyboard and moves with arrows, Home, End and letters', async () => {
    remove.mockClear();
    const { user, trigger } = setup(basic);
    trigger.focus();
    await user.keyboard('{Enter}');
    const item = (name: string) => screen.getByRole('menuitem', { name });
    expect(item('Edit')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(item('Archive')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(item('Remove')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(item('Edit')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(item('Remove')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(item('Edit')).toHaveFocus();
    await user.keyboard('{End}');
    expect(item('Remove')).toHaveFocus();
    await user.keyboard('a');
    expect(item('Archive')).toHaveFocus();
    await user.keyboard('r');
    expect(item('Remove')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();

    await user.keyboard(' ');
    expect(item('Edit')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    expect(item('Edit')).toHaveFocus();
    await user.keyboard('{Escape}');
    await user.keyboard('{ArrowUp}');
    expect(item('Remove')).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { user, trigger } = setup(basic);
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Tab and moves focus past the trigger', async () => {
    const { user, trigger } = setup(basic);
    await user.click(trigger);
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();

    await user.click(trigger);
    await user.tab({ shift: true });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
  });

  it('closes on an outside click and on a second trigger click', async () => {
    const { user, trigger } = setup(basic);
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Before' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();

    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps disabled and loading items focusable but inert', async () => {
    const run = vi.fn();
    const { user, trigger } = setup([
      {
        key: 'a',
        label: 'Archive',
        disabled: true,
        onSelect: run,
        description: 'Locked',
      },
      { key: 'b', label: 'Upload', loading: true, onSelect: run },
      { key: 'c', label: 'Send', onSelect: run },
    ]);
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    await user.click(trigger);
    const archive = screen.getByRole('menuitem', { name: 'Archive' });
    expect(archive).toHaveAttribute('aria-disabled', 'true');
    expect(archive).toHaveAccessibleDescription('Locked');
    expect(screen.getByRole('menuitem', { name: 'Upload' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Send' })).toHaveFocus();
    await user.click(archive);
    await user.click(screen.getByRole('menuitem', { name: 'Upload' }));
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows an item spinner after the browser translates the open menu', async () => {
    const user = userEvent.setup();
    const items = (loading: boolean): ActionsMenuItem[] => [
      { key: 'edit', label: 'Edit', onSelect: edit },
      { key: 'upload', label: 'Upload', loading, onSelect: edit },
    ];
    const { rerender } = renderWithProviders(
      <ActionsMenu items={items(false)} />,
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByRole('menu');
    translateText(menu, '上传');

    rerender(<ActionsMenu items={items(true)} />);
    expect(menu.querySelectorAll('.animate-spin')).toHaveLength(1);
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['上传', '上传']);
  });

  it('navigates for link items, also with Space', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <ActionsMenu
              items={[
                { key: 'open', label: 'Open', to: '/target' },
                { key: 'other', label: 'Other', onSelect: () => undefined },
              ]}
            />
          }
        />
        <Route path="/target" element={<p>Target page</p>} />
      </Routes>,
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveAttribute(
      'href',
      '/target',
    );
    await user.keyboard(' ');
    expect(await screen.findByText('Target page')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('repositions on scroll and resize while open', async () => {
    const { user, trigger } = setup(basic);
    let bottom = 100;
    trigger.getBoundingClientRect = () =>
      ({ top: bottom - 36, bottom, right: 300 }) as DOMRect;
    await user.click(trigger);
    const menu = screen.getByRole('menu');
    expect(menu.style.top).toBe('104px');
    bottom = 200;
    fireEvent.scroll(window);
    expect(menu.style.top).toBe('204px');
    bottom = 150;
    fireEvent(window, new Event('resize'));
    expect(menu.style.top).toBe('154px');
  });
});

describe('placeMenu', () => {
  const viewport = { width: 390, height: 844 };
  const menu = { width: 192, height: 140 };

  it('right-aligns the menu below the trigger', () => {
    expect(
      placeMenu({ top: 100, bottom: 136, right: 370 }, menu, viewport),
    ).toEqual({ top: 140, left: 178, maxHeight: 696 });
  });

  it('flips above the trigger near the viewport bottom', () => {
    expect(
      placeMenu({ top: 760, bottom: 796, right: 370 }, menu, viewport),
    ).toEqual({ top: 616, left: 178, maxHeight: 748 });
  });

  it('stays inside the viewport horizontally', () => {
    expect(
      placeMenu({ top: 0, bottom: 36, right: 40 }, menu, viewport).left,
    ).toBe(8);
    expect(
      placeMenu({ top: 0, bottom: 36, right: 600 }, menu, viewport).left,
    ).toBe(190);
  });

  it('caps the height to the larger side when neither fits', () => {
    const tall = { width: 192, height: 2000 };
    expect(
      placeMenu({ top: 300, bottom: 336, right: 370 }, tall, viewport),
    ).toEqual({
      top: 340,
      left: 178,
      maxHeight: 496,
    });
    expect(
      placeMenu({ top: 600, bottom: 636, right: 370 }, tall, viewport),
    ).toEqual({
      top: 8,
      left: 178,
      maxHeight: 588,
    });
  });
});

describe('RowActions', () => {
  it('renders a lone file item as a file button', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <RowActions
        items={[
          {
            key: 'upload',
            label: 'Upload PDF',
            file: { accept: '.pdf', inputLabel: 'PDF file', onChange },
          },
        ]}
      />,
    );
    const input = screen.getByLabelText('PDF file');
    expect(input.closest('label')).toHaveTextContent('Upload PDF');
    await userEvent.upload(input, new File(['%PDF'], 'a.pdf'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('renders nothing, a plain button, or a menu', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const view = renderWithProviders(<RowActions items={[]} />);
    expect(view.container).toBeEmptyDOMElement();
    view.unmount();

    const single = renderWithProviders(
      <RowActions
        items={[
          {
            key: 'r',
            label: 'Remind',
            ariaLabel: 'Remind Jane',
            onSelect: run,
          },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remind Jane' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    single.unmount();

    const link = renderWithProviders(
      <RowActions items={[{ key: 'o', label: 'Open', to: '/x' }]} />,
    );
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/x',
    );
    link.unmount();

    renderWithProviders(
      <RowActions
        label="More actions for Jane"
        items={[
          { key: 'r', label: 'Remind', onSelect: run },
          { key: 'a', label: 'Archive', onSelect: run },
        ]}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'More actions for Jane' }),
    );
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('shows a disabled lone action with its reason as a title', () => {
    renderWithProviders(
      <RowActions
        items={[
          { key: 'x', label: 'Remove', disabled: true, description: 'In use' },
        ]}
      />,
    );
    const button = screen.getByRole('button', { name: 'Remove' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'In use');
  });
});
