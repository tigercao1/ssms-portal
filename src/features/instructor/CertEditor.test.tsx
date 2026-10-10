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
      { discipline: 'ski', rookieSessionCompleted: false, trainerLevel: 1 },
    ]);
    expect(
      screen.getByRole('switch', { name: 'Rookie session completed' }),
    ).toHaveAttribute('aria-checked', 'false');
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

  it('keeps the rookie toggle off when a trainer level is chosen', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Harness
        initial={[
          { discipline: 'ski', rookieSessionCompleted: false, trainerLevel: 1 },
        ]}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Trainer level' }),
      '3',
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { discipline: 'ski', rookieSessionCompleted: false, trainerLevel: 3 },
    ]);
    expect(
      screen.getByRole('switch', { name: 'Rookie session completed' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles the rookie session without changing the trainer level', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={[trainedSki]} onChange={onChange} />);
    await userEvent.click(
      screen.getByRole('switch', { name: 'Rookie session completed' }),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { discipline: 'ski', rookieSessionCompleted: false, trainerLevel: 2 },
    ]);
  });

  it('removes a row', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={[trainedSki]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe('CertEditor', () => {
  function CertHarness({
    initial,
    onChange,
  }: {
    initial: CertDraft[];
    onChange?: (next: CertDraft[]) => void;
  }) {
    const [value, setValue] = useState(initial);
    return (
      <CertEditor
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  }

  it('shows localised track labels while keeping API values', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <CertHarness
        initial={[{ org: 'csia', track: 'regular', level: 1, isPartial: false }]}
        onChange={onChange}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Track' });
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Regular',
      'Park',
      'Carving',
    ]);
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
      'regular',
      'park',
      'carving',
    ]);
    await userEvent.selectOptions(select, 'Carving');
    expect(onChange).toHaveBeenLastCalledWith([
      { org: 'casi', track: 'carving', level: 1, isPartial: false },
    ]);
  });

  it('shows Chinese track labels under zh-CN', () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(
      <CertHarness
        initial={[{ org: 'csia', track: 'park', level: 1, isPartial: false }]}
      />,
    );
    const select = screen.getByRole('combobox', { name: '类别' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['常规', '公园', '刻滑']);
    expect(select).toHaveValue('park');
  });

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
