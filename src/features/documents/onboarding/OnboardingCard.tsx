import { Link } from 'react-router-dom';
import { Card } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import type { MyChecklist } from '../api';
import { ProgressBar } from './ProgressBar';
import { checklistProgress, useMyChecklist } from './queries';
import { LockIcon } from './Locked';

function LockedOnboardingCard({ checklist }: { checklist: MyChecklist }) {
  const t = useT();
  const total = checklist.items.length;
  const docs = checklist.items.filter((i) => i.type === 'document').length;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-dashed border-grey bg-sunken p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-navy-tint text-navy">
          <LockIcon />
        </span>
        <div>
          <h2 className="text-xl">
            {total > 0
              ? t.onboarding.cardLockedTitle.replace('{n}', String(total))
              : t.onboarding.cardTitle}
          </h2>
          <p className="text-sm text-slate">{t.onboarding.cardLockedUnlocks}</p>
        </div>
      </div>
      {total > 0 && (
        <p className="text-sm text-slate">
          {t.onboarding.cardLockedBody
            .replace('{docs}', String(docs))
            .replace('{certs}', String(total - docs))}
        </p>
      )}
    </section>
  );
}

/** Profile-page summary of the onboarding checklist ("x of y done"), or its locked preview. */
export function OnboardingCard() {
  const t = useT();
  const { data } = useMyChecklist();
  if (!data) return null;
  if (data.locked) return <LockedOnboardingCard checklist={data} />;
  if (data.items.length === 0) return null;
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
