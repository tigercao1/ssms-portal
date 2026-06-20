import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Field } from './Field';
import { Input } from './Input';
import { renderWithProviders } from '@/test/render';

describe('Field', () => {
  it('wires label, aria-invalid and aria-describedby on error', () => {
    renderWithProviders(
      <Field label="Email" error="Required" required>
        {(p) => <Input {...p} />}
      </Field>,
    );
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(screen.getByText('Required')).toHaveAttribute('id', describedBy!);
  });

  it('shows a hint when there is no error', () => {
    renderWithProviders(
      <Field label="Name" hint="Your full name">
        {(p) => <Input {...p} />}
      </Field>,
    );
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByText('Your full name')).toBeInTheDocument();
  });
});
