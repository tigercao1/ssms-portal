import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileButton } from './FileButton';

afterEach(() => vi.restoreAllMocks());

describe('FileButton', () => {
  it('is a label around a visually hidden file input that a click reaches without a scripted click', async () => {
    const scripted = vi.spyOn(HTMLInputElement.prototype, 'click');
    const onInputClick = vi.fn();
    render(
      <FileButton accept="image/png" onClick={onInputClick}>
        Upload photo
      </FileButton>,
    );
    const input = screen.getByLabelText('Upload photo');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/png');
    expect(input).toHaveClass('sr-only');
    expect(input).not.toHaveClass('hidden');
    expect(input.closest('label')).toHaveTextContent('Upload photo');

    await userEvent.click(screen.getByText('Upload photo'));
    expect(onInputClick).toHaveBeenCalledTimes(1);
    expect(scripted).not.toHaveBeenCalled();
  });

  it('passes the chosen file to onChange', async () => {
    const onChange = vi.fn();
    render(<FileButton onChange={onChange}>Upload</FileButton>);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Upload'), file);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.files[0]).toBe(file);
  });

  it('takes keyboard focus on the input', async () => {
    render(
      <>
        <button type="button">Before</button>
        <FileButton>Upload</FileButton>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Before' }));
    await userEvent.tab();
    expect(screen.getByLabelText('Upload')).toHaveFocus();
  });

  it('disables the input and marks it busy while loading', () => {
    render(<FileButton loading>Uploading…</FileButton>);
    const input = screen.getByLabelText('Uploading…');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-busy', 'true');
  });
});
