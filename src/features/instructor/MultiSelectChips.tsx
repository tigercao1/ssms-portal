import { cn } from '@/lib/cn';
import type { RefItem } from '@/lib/types';

/** Checkbox-chip multi-select for reference relations (W2.2). */
export function MultiSelectChips({
  options,
  selected,
  onChange,
}: {
  options: RefItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.id)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              on
                ? 'border-navy bg-navy text-white'
                : 'border-grey bg-surface text-ink hover:bg-navy-tint',
            )}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}
