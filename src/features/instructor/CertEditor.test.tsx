import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CertEditor, TrainerEditor } from './CertEditor';
import { renderWithProviders } from '@/test/render';
import type { UpdateProfileBody } from '@/lib/types';

type TrainerDraft = NonNullable<UpdateProfileBody['trainerStatus']>[number];
type CertDraft = NonNullable<UpdateProfileBody['certifications']>[number];

function Harness({
  initial,
  onChange,
}: {
  initial: TrainerDraft[];
  onChange?: (next: TrainerDraft[]) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TrainerEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const trainedSki: TrainerDraft = {
  discipline: 'ski',
  rookieSessionCompleted: true,
  trainerLevel: 2,
};

describe('TrainerEditor', () => {
  it('shows localised discipline labels while keeping API values', () => {
    renderWithProviders(<Harness initial={[trainedSki]} />);
    const select = screen.getByRole('combobox', { name: 'Discipline' });
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Ski', 'Snowboard']);
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
      'ski',
      'snowboard',
    ]);
  });

  it('shows Chinese discipline labels and rookie wording under zh-CN', () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(<Harness initial={[trainedSki]} />);
    const select = screen.getByRole('combobox', { name: '项目' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['双板', '单板']);
    expect(
      screen.getByRole('switch', { name: '已完成培训师实习' }),
    ).toBeInTheDocument();
  });

  it('offers no empty "None" trainer level', () => {
    renderWithProviders(<Harness initial={[trainedSki]} />);
    const select = screen.getByRole('combobox', { name: 'Trainer level' });
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(within(select).queryByText('None')).not.toBeInTheDocument();
  });

  it('adds a new trainer row at level 1', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={[]} onChange={onChange} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Add trainer status' }),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { discipline: 'ski', rookieSessionCompleted: true, trainerLevel: 1 },
    ]);
    expect(screen.getByRole('combobox', { name: 'Trainer level' })).toHaveValue(
      '1',
    );
  });

  it('renders a legacy row without a level unchanged, with a disabled placeholder', () => {
    const onChange = vi.fn();
    const legacy: TrainerDraft = {
      discipline: 'snowboard',
      rookieSessionCompleted: true,
      trainerLevel: null,
    };
    renderWithProviders(<Harness initial={[legacy]} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Trainer level' });
    expect(select).toHaveValue('');
    expect(
      within(select).getByRole('option', { name: 'Select level' }),
    ).toBeDisabled();
    expect(select).not.toBeRequired();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('requires a level once a legacy row without one is edited', async () => {
    renderWithProviders(
      <Harness
        initial={[
          {
            discipline: 'ski',
            rookieSessionCompleted: true,
            trainerLevel: null,
          },
        ]}
      />,
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Discipline' }),
      'snowboard',
    );
    const level = screen.getByRole('combobox', { name: 'Trainer level' });
    expect(level).toBeRequired();
    expect(level).toBeInvalid();

    await userEvent.selectOptions(level, '3');
    expect(level).toHaveValue('3');
    expect(level).toBeValid();
    expect(
      within(level).queryByRole('option', { name: 'Select level' }),
    ).not.toBeInTheDocument();
  });

  it('removes a row', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={[trainedSki]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe('CertEditor', () => {
  function CertHarness({ initial }: { initial: CertDraft[] }) {
    const [value, setValue] = useState(initial);
    return <CertEditor value={value} onChange={setValue} />;
  }

  it('shows the partial toggle only for the regular track', async () => {
    renderWithProviders(
      <CertHarness
        initial={[
          { org: 'csia', track: 'regular', level: 2, isPartial: false },
        ]}
      />,
    );
    const partial = screen.getByRole('switch', { name: 'Partial' });
    await userEvent.click(partial);
    expect(partial).toHaveAttribute('aria-checked', 'true');

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Track' }),
      'park',
    );
    expect(
      screen.queryByRole('switch', { name: 'Partial' }),
    ).not.toBeInTheDocument();
  });
});
