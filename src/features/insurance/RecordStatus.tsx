import { useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { StatePill } from '@/features/documents/onboarding/StatePill';
import { recordStatus, requestStatus } from './money';
import type { InsuranceRecord, InsuranceRequest } from './types';

export function studentNames(record: InsuranceRecord, separator: string) {
  return record.students.map((s) => s.name).join(separator);
}

export function durationText(hours: number | null, t: Messages) {
  if (hours === null) return '—';
  return (hours === 1 ? t.insurance.hoursOne : t.insurance.hoursMany).replace(
    '{n}',
    String(hours),
  );
}

export function RecordStatusCell({ record }: { record: InsuranceRecord }) {
  const t = useT();
  const status = recordStatus(record, t);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatePill tone={status.tone} label={status.label} />
      {status.sub && <span className="text-xs text-slate">{status.sub}</span>}
    </span>
  );
}

export function RequestStatusPill({
  request,
}: {
  request: Pick<InsuranceRequest, 'paymentStatus' | 'lessons'>;
}) {
  const t = useT();
  const status = requestStatus(request, t);
  return (
    <span data-testid="request-status">
      <StatePill tone={status.tone} label={status.label} />
    </span>
  );
}
