import { useT } from '@/i18n/core/I18nProvider';
import { DotPill } from './DotPill';
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
  return <DotPill {...statusMeta(status, isActive, t)} />;
}
