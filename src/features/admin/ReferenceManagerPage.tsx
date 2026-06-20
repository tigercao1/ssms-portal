import { useState } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { ApiError } from '@/lib/api';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Spinner,
  Toggle,
} from '@/components';
import {
  useCourseLevels,
  useExamPreparations,
  useLanguages,
  useTeachingLocations,
  type ReferenceSlug,
} from '@/features/reference/api';
import { useAddReference } from './api';
import type { RefItem } from '@/lib/types';

const TABS: { slug: ReferenceSlug; labelKey: keyof ReturnType<typeof useT>['reference'] }[] =
  [
    { slug: 'teaching-locations', labelKey: 'teachingLocations' },
    { slug: 'languages', labelKey: 'languages' },
    { slug: 'course-levels-offered', labelKey: 'courseLevels' },
    { slug: 'exam-preparations', labelKey: 'examPreps' },
  ];

function useRows(slug: ReferenceSlug) {
  const loc = useTeachingLocations();
  const lang = useLanguages();
  const lvl = useCourseLevels();
  const exam = useExamPreparations();
  if (slug === 'teaching-locations') return loc;
  if (slug === 'languages') return lang;
  if (slug === 'course-levels-offered') return lvl;
  return exam;
}

/** W2.13 — admin reference-data manager: tabs + add-row form. */
export function ReferenceManagerPage() {
  const t = useT();
  const [slug, setSlug] = useState<ReferenceSlug>('teaching-locations');
  const rows = useRows(slug);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{t.admin.referenceTitle}</h1>

      <div className="flex flex-wrap gap-1 border-b border-grey/60">
        {TABS.map((tab) => (
          <button
            key={tab.slug}
            onClick={() => setSlug(tab.slug)}
            className={
              'border-b-2 px-3 py-2 text-sm transition-colors ' +
              (slug === tab.slug
                ? 'border-red font-medium text-navy'
                : 'border-transparent text-slate hover:text-navy')
            }
          >
            {t.reference[tab.labelKey]}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-0">
          {rows.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                  <th className="px-4 py-2 font-medium">{t.admin.keyLabel}</th>
                  <th className="px-4 py-2 font-medium">{t.admin.nameLabel}</th>
                </tr>
              </thead>
              <tbody>
                {(rows.data ?? []).map((r: RefItem, i: number) => (
                  <tr key={r.id} className={i % 2 ? 'bg-sunken' : undefined}>
                    <td className="px-4 py-2 font-mono text-xs text-slate">{r.key}</td>
                    <td className="px-4 py-2 text-ink">{r.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <AddRow slug={slug} />
      </div>
    </div>
  );
}

function AddRow({ slug }: { slug: ReferenceSlug }) {
  const t = useT();
  const add = useAddReference(slug);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [keyError, setKeyError] = useState<string | null>(null);

  async function submit() {
    setKeyError(null);
    try {
      await add.mutateAsync({
        key: key.trim(),
        name: name.trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive,
      });
      setKey('');
      setName('');
      setSortOrder('0');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setKeyError(t.admin.duplicateKey);
      }
    }
  }

  return (
    <Card className="flex h-fit flex-col gap-4">
      <h2 className="text-lg">{t.admin.addRow}</h2>
      <Field label={t.admin.keyLabel} required error={keyError ?? undefined}>
        {(p) => (
          <Input {...p} value={key} onChange={(e) => setKey(e.target.value)} />
        )}
      </Field>
      <Field label={t.admin.nameLabel} required>
        {(p) => (
          <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label={t.admin.sortOrder}>
        {(p) => (
          <Input
            {...p}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        )}
      </Field>
      <div className="flex items-center gap-2">
        <Toggle checked={isActive} onChange={setIsActive} label={t.admin.activeLabel} />
        <span className="text-sm text-slate">{t.admin.activeLabel}</span>
      </div>
      {add.isSuccess && <Banner tone="approved">{t.admin.addedRow}</Banner>}
      <Button
        onClick={submit}
        loading={add.isPending}
        disabled={!key.trim() || !name.trim()}
      >
        {t.common.add}
      </Button>
    </Card>
  );
}
