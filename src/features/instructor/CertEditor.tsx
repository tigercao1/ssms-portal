import { useT } from '@/i18n/core/I18nProvider';
import { Button, Select, Toggle } from '@/components';
import type {
  CertOrg,
  CertTrack,
  Discipline,
  UpdateProfileBody,
} from '@/lib/types';

type CertDraft = NonNullable<UpdateProfileBody['certifications']>[number];
type TrainerDraft = NonNullable<UpdateProfileBody['trainerStatus']>[number];

const LEVELS = [1, 2, 3, 4];

/**
 * W2.2 — certifications editor. Mirrors the DB CHECKs for instant feedback:
 * carving ⇒ CASI; park/carving can't be partial. Deep rules are still enforced
 * transactionally server-side.
 */
export function CertEditor({
  value,
  onChange,
}: {
  value: CertDraft[];
  onChange: (next: CertDraft[]) => void;
}) {
  const t = useT();

  function update(i: number, patch: Partial<CertDraft>) {
    const next = value.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    // carving ⇒ casi
    const row = next[i]!;
    if (row.track === 'carving') row.org = 'casi';
    if (row.track !== 'regular') row.isPartial = false;
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((c, i) => {
        const canBePartial = c.track === 'regular';
        return (
          <div
            key={i}
            className="grid grid-cols-2 gap-3 rounded-md border border-grey/60 bg-sunken p-3 sm:grid-cols-4"
          >
            <label className="flex flex-col gap-1 text-xs text-slate">
              {t.profile.org}
              <Select
                value={c.org}
                disabled={c.track === 'carving'}
                onChange={(e) => update(i, { org: e.target.value as CertOrg })}
              >
                <option value="csia">CSIA</option>
                <option value="casi">CASI</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate">
              {t.profile.track}
              <Select
                value={c.track}
                onChange={(e) =>
                  update(i, { track: e.target.value as CertTrack })
                }
              >
                <option value="regular">regular</option>
                <option value="park">park</option>
                <option value="carving">carving</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate">
              {t.profile.level}
              <Select
                value={c.level}
                onChange={(e) => update(i, { level: Number(e.target.value) })}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-end justify-between gap-2">
              {canBePartial && (
                <label className="flex items-center gap-2 text-xs text-slate">
                  <Toggle
                    checked={Boolean(c.isPartial)}
                    onChange={(v) => update(i, { isPartial: v })}
                    label={t.profile.partial}
                  />
                  {t.profile.partial}
                </label>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                {t.common.remove}
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() =>
          onChange([
            ...value,
            { org: 'csia', track: 'regular', level: 1, isPartial: false },
          ])
        }
      >
        {t.profile.addCert}
      </Button>
    </div>
  );
}

/** W2.2 — trainer-status editor. trainerLevel requires rookieSessionCompleted. */
export function TrainerEditor({
  value,
  onChange,
}: {
  value: TrainerDraft[];
  onChange: (next: TrainerDraft[]) => void;
}) {
  const t = useT();

  function update(i: number, patch: Partial<TrainerDraft>) {
    const next = value.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    const row = next[i]!;
    if (row.trainerLevel != null && !row.rookieSessionCompleted) {
      row.rookieSessionCompleted = true; // enforce CHECK
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((r, i) => (
        <div
          key={i}
          className="grid grid-cols-2 gap-3 rounded-md border border-grey/60 bg-sunken p-3 sm:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-xs text-slate">
            {t.profile.discipline}
            <Select
              value={r.discipline}
              onChange={(e) =>
                update(i, { discipline: e.target.value as Discipline })
              }
            >
              <option value="ski">ski</option>
              <option value="snowboard">snowboard</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate">
            {t.profile.trainerLevel}
            <Select
              value={r.trainerLevel ?? ''}
              onChange={(e) =>
                update(i, {
                  trainerLevel: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">{t.common.none}</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate">
            <Toggle
              checked={Boolean(r.rookieSessionCompleted)}
              onChange={(v) => update(i, { rookieSessionCompleted: v })}
              label={t.profile.rookieDone}
            />
            {t.profile.rookieDone}
          </label>
          <div className="flex items-end justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            >
              {t.common.remove}
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() =>
          onChange([
            ...value,
            { discipline: 'ski', rookieSessionCompleted: false, trainerLevel: null },
          ])
        }
      >
        {t.profile.addTrainer}
      </Button>
    </div>
  );
}
