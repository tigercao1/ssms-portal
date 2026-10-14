import { Link } from 'react-router-dom';
import { Card } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import { ProgressBar } from './ProgressBar';
import { checklistProgress, useMyChecklist } from './queries';

/** Profile-page summary of the onboarding checklist ("x of y done"). */
export function OnboardingCard() {
  const t = useT();
  const { data } = useMyChecklist();
  if (!data || data.items.length === 0) return null;
  const { done, total } = checklistProgress(data.items);
  const progress = t.onboarding.progress
    .replace('{done}', String(done))
    .replace('{total}', String(total));
  const allDone = done === total;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl">{t.onboarding.cardTitle}</h2>
        <span className="text-sm font-medium text-navy">
          {allDone ? t.onboarding.cardAllDone : progress}
        </span>
      </div>
      <ProgressBar done={done} total={total} label={progress} />
      <p className="text-sm text-slate">{t.onboarding.cardBody}</p>
      <Link
        to="/onboarding"
        className="self-start text-sm font-medium text-navy underline underline-offset-4 hover:text-red"
      >
        {t.onboarding.cardOpen}
      </Link>
    </Card>
  );
}
