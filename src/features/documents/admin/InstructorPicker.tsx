import { useMemo, useState } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { Input, Spinner, StatusPill } from '@/components';
import { useAdminInstructors } from '@/features/admin/api';

export function InstructorPicker({
  picked,
  onToggle,
  showError,
}: {
  picked: ReadonlySet<string>;
  onToggle: (id: string) => void;
  showError: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const instructors = useAdminInstructors({});
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (instructors.data ?? [])
      .map((i) => ({
        ...i,
        name:
          localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email,
      }))
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          i.email.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [instructors.data, query, locale]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-label={t.documents.searchInstructors}
        placeholder={t.documents.searchInstructors}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="text-xs text-slate">
        {t.documents.pickedCount.replace('{n}', String(picked.size))}
      </p>
      {instructors.isLoading ? (
        <Spinner />
      ) : (
        <ul className="max-h-64 divide-y divide-grey/40 overflow-y-auto rounded-md border border-grey/60">
          {rows.map((i) => (
            <li key={i.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-sunken">
                <input
                  type="checkbox"
                  checked={picked.has(i.id)}
                  onChange={() => onToggle(i.id)}
                />
                <span className="flex-1">
                  <span className="block text-ink">{i.name}</span>
                  <span className="block font-mono text-xs text-slate">
                    {i.email}
                  </span>
                </span>
                <StatusPill status={i.approvalStatus} isActive={i.isActive} />
              </label>
            </li>
          ))}
        </ul>
      )}
      {showError && (
        <p className="text-sm text-status-rejected">
          {t.documents.pickAtLeastOne}
        </p>
      )}
    </div>
  );
}

export function useToggleSet(initial: string[] = []) {
  const [set, setSet] = useState(() => new Set(initial));
  const toggle = (id: string) =>
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return [set, toggle] as const;
}
