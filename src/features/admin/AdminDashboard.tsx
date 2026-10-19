import { Link } from 'react-router-dom';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import {
  Card,
  EmptyState,
  Spinner,
  StagePill,
  stageMeta,
  type InstructorStage,
} from '@/components';
import { useAdminInstructors } from './api';

const DASHBOARD_STAGES: readonly InstructorStage[] = [
  'pending',
  'onboarding',
  'in_review',
  'going_live',
  'live',
  'rejected',
  'deactivated',
];

function stageListPath(stage: InstructorStage): string {
  return `/admin/instructors?${new URLSearchParams({ stage })}`;
}

function StageStat({
  stage,
  value,
}: {
  stage: InstructorStage;
  value: number;
}) {
  const t = useT();
  const meta = stageMeta(stage, t);
  const accent = stage === 'pending' && value > 0;
  return (
    <Link to={stageListPath(stage)} className="group rounded-lg">
      <Card className="flex h-full flex-col gap-1 p-4 transition-colors group-hover:bg-sunken">
        <div
          className="font-display text-5xl"
          style={{ color: accent ? 'var(--red)' : 'var(--ink)' }}
        >
          {value}
        </div>
        <div className="flex items-baseline gap-1.5 text-sm font-medium">
          <span
            className="h-1.5 w-1.5 flex-none -translate-y-0.5 rounded-full"
            style={{ background: meta.color }}
            aria-hidden
          />
          <span className={meta.textClass}>{meta.label}</span>
        </div>
      </Card>
    </Link>
  );
}

/** W2.6 — admin dashboard: counters + needs-review queue. */
export function AdminDashboard() {
  const t = useT();
  const { locale } = useLocale();
  const { data, isLoading } = useAdminInstructors({});

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7" />
      </div>
    );

  const all = data ?? [];
  const pending = all.filter((i) => i.stage === 'pending');

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl">{t.admin.dashboardTitle}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {DASHBOARD_STAGES.map((stage) => (
          <StageStat
            key={stage}
            stage={stage}
            value={all.filter((i) => i.stage === stage).length}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl">{t.admin.needsReview}</h2>
        {pending.length === 0 ? (
          <EmptyState title={t.admin.noPending} />
        ) : (
          <Card className="divide-y divide-grey/40 p-0">
            {pending.map((row) => (
              <Link
                key={row.id}
                to={`/admin/instructors/${row.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-sunken"
              >
                <span data-private className="font-medium text-navy">
                  {localizeField(
                    row.displayNameEn,
                    row.displayNameZh,
                    locale,
                  ) || row.email}
                </span>
                <StagePill stage="pending" />
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
