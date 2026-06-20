import { useT } from '@/i18n/core/I18nProvider';
import { statusMeta, type ApprovalStatus } from './statusMeta';

/** Color-coded status chip with a leading dot + 3px rule (never color alone). */
export function StatusPill({
  status,
  isActive,
}: {
  status: ApprovalStatus;
  isActive: boolean;
}) {
  const t = useT();
  const meta = statusMeta(status, isActive, t);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm border-l-[3px] bg-sunken px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: meta.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: meta.color }}
        aria-hidden
      />
      <span className={meta.textClass}>{meta.label}</span>
    </span>
  );
}
