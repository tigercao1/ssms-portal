import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from './Drawer';

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
});
