import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DocumentLanguageSwitch } from './DocumentLanguageSwitch';

describe('DocumentLanguageSwitch', () => {
  it('lists English before Chinese whichever version is the main one', () => {
    render(
      <DocumentLanguageSwitch
        languages={['zh', 'en']}
        value="zh"
        label="Document language"
        labels={{ en: 'EN', zh: '中文' }}
        onChange={vi.fn()}
      />,
    );
    const names = within(
      screen.getByRole('group', { name: 'Document language' }),
    )
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual(['EN', '中文']);
  });
});
