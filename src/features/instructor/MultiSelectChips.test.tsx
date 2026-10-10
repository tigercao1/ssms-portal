import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MultiSelectChips } from './MultiSelectChips';
import { renderWithProviders } from '@/test/render';
import type { RefItem } from '@/lib/types';

const options: RefItem[] = [
  { id: 'l1', key: 'loc.whistler', name: 'Whistler', nameZh: '惠斯勒' },
  { id: 'l2', key: 'loc.cypress', name: 'Cypress', nameZh: null },
  { id: 'l3', key: 'loc.seymour', name: 'Seymour' },
];

describe('MultiSelectChips', () => {
  it('shows English names in English', () => {
    renderWithProviders(
      <MultiSelectChips options={options} selected={[]} onChange={vi.fn()} />,
    );
    expect(
      screen.getAllByRole('button').map((b) => b.textContent),
    ).toEqual(['Whistler', 'Cypress', 'Seymour']);
  });

  it('shows Chinese names in Chinese and falls back to English', () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(
      <MultiSelectChips options={options} selected={[]} onChange={vi.fn()} />,
    );
    expect(
      screen.getAllByRole('button').map((b) => b.textContent),
    ).toEqual(['惠斯勒', 'Cypress', 'Seymour']);
  });

  it('toggles selection by id whatever the label language', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    const onChange = vi.fn();
    renderWithProviders(
      <MultiSelectChips options={options} selected={['l2']} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Cypress' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: '惠斯勒' }));
    expect(onChange).toHaveBeenLastCalledWith(['l2', 'l1']);
    await userEvent.click(screen.getByRole('button', { name: 'Cypress' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
