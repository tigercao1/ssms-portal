import { Link } from 'react-router-dom';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { Card, EmptyState, Spinner, StatusPill } from '@/components';
import { useAdminInstructors } from './api';

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span
        className="font-display text-5xl"
        style={{ color: accent && value > 0 ? 'var(--red)' : 'var(--ink)' }}
      >
        {value}
      </span>
      <span className="text-sm text-slate">{label}</span>
    </Card>
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
  const pending = all.filter((i) => i.approvalStatus === 'pending');
  const approved = all.filter((i) => i.approvalStatus === 'approved');
  const inactive = all.filter((i) => i.approvalStatus === 'approved' && !i.isActive);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl">{t.admin.dashboardTitle}</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t.admin.statPending} value={pending.length} accent />
        <Stat label={t.admin.statApproved} value={approved.length} />
        <Stat label={t.admin.statInactive} value={inactive.length} />
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
                <span className="font-medium text-navy">
                  {localizeField(row.displayNameEn, row.displayNameZh, locale) ||
                    row.email}
                </span>
                <StatusPill status={row.approvalStatus} isActive={row.isActive} />
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
