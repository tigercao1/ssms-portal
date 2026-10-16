import type { SelectHTMLAttributes } from 'react';
import { Select } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import { useSeasons } from './api';

type SeasonSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'onChange' | 'children'
> & {
  value: string;
  onChange: (key: string) => void;
};

export function SeasonSelect({
  value,
  onChange,
  disabled,
  ...rest
}: SeasonSelectProps) {
  const t = useT();
  const seasons = useSeasons();
  const list = seasons.data ?? [];
  return (
    <Select
      {...rest}
      value={value}
      disabled={disabled || list.length === 0}
      onChange={(e) => onChange(e.target.value)}
    >
      {list.length === 0 && (
        <option value="">
          {seasons.isLoading ? t.seasons.loading : t.seasons.none}
        </option>
      )}
      {list.map((s) => (
        <option key={s.key} value={s.key}>
          {s.isCurrent
            ? t.seasons.currentOption.replace('{key}', s.key)
            : s.key}
        </option>
      ))}
    </Select>
  );
}
