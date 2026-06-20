import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LangSwitch } from './LangSwitch';
import { renderWithProviders } from '@/test/render';

describe('LangSwitch', () => {
  it('switches the document language to zh-CN', async () => {
    renderWithProviders(<LangSwitch />);
    await userEvent.click(screen.getByRole('button', { name: '中文' }));
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(localStorage.getItem('ssms.locale')).toBe('zh-CN');
  });
});
