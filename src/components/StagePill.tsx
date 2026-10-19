import { useT } from '@/i18n/core/I18nProvider';
import { DotPill } from './DotPill';
import { stageMeta, type InstructorStage } from './statusMeta';

export function StagePill({ stage }: { stage: InstructorStage }) {
  const t = useT();
  return <DotPill {...stageMeta(stage, t)} />;
}
