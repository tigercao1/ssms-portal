import { Link } from 'react-router-dom';
import { Card } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import type { GoLiveReadiness } from '@/lib/types';
import { profileGapsText } from '@/features/instructor/goLive';
import type { MyChecklist } from '../api';
import { ProgressBar, progressText } from './ProgressBar';
import { StatePill, type PillTone } from './StatePill';
import { checklistProgress, useMyChecklist } from './queries';
import { LockIcon, lockText } from './Locked';

function LockedOnboardingCard({ checklist }: { checklist: MyChecklist }) {
  const t = useT();
  const closed =
    checklist.lockReason === 'rejected' ||
    checklist.lockReason === 'deactivated';
  const total = closed ? 0 : checklist.items.length;
  const docs = checklist.items.filter((i) => i.type === 'document').length;
  const [closedTitle, closedBody] =
    closed && checklist.lockReason ? lockText(checklist.lockReason, t) : [];
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
          <p className="text-sm text-slate">
            {closedTitle ?? t.onboarding.cardLockedUnlocks}
          </p>
        </div>
      </div>
      {closedBody && <p className="text-sm text-slate">{closedBody}</p>}
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

type CardStatus = { tone: PillTone; pill: string; body: string };

function cardStatus(
  readiness: GoLiveReadiness,
  toDoBody: string,
  t: Messages,
): CardStatus {
  switch (readiness.stage) {
    case 'live':
      return {
        tone: 'done',
        pill: t.onboarding.cardAllDone,
        body: t.onboarding.cardBody,
      };
    case 'going_live':
      return {
        tone: 'info',
        pill: t.onboarding.cardPillGoingLive,
        body: t.onboarding.cardGoingLiveBody,
      };
    case 'in_review':
      return {
        tone: 'warn',
        pill: t.onboarding.cardPillInReview,
        body: t.onboarding.cardInReviewBody,
      };
    default:
      return {
        tone: 'warn',
        pill: t.onboarding.cardPillToDo,
        body: toDoBody,
      };
  }
}

const LINK_CLASS =
  'self-start text-sm font-medium text-navy underline underline-offset-4 hover:text-red';

/** Profile-page summary of the onboarding checklist and go-live status, or its locked preview. */
export function OnboardingCard({ readiness }: { readiness?: GoLiveReadiness }) {
  const t = useT();
  const { locale } = useLocale();
  const { data } = useMyChecklist();
  if (!data) return null;
  if (data.locked) return <LockedOnboardingCard checklist={data} />;
  const empty = data.items.length === 0;
  if (empty && !readiness) return null;
  const counts = checklistProgress(data.items);
  const progress = progressText(counts, t);
  const toDoBody = empty
    ? t.onboarding.cardEmptyToDoBody
    : t.onboarding.cardToDoBody.replace('{progress}', progress);
  const status = readiness && cardStatus(readiness, toDoBody, t);
  const profileGaps =
    readiness &&
    profileGapsText(readiness.missing, t, locale, {
      includeCertification: empty,
    });
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl">{t.onboarding.cardTitle}</h2>
        {status ? (
          <StatePill tone={status.tone} label={status.pill} />
        ) : (
          <span className="text-sm font-medium text-navy">
            {counts.done === counts.total ? t.onboarding.cardAllDone : progress}
          </span>
        )}
      </div>
      {!empty && <ProgressBar progress={counts} label={progress} />}
      <p className="text-sm text-slate">
        {status ? status.body : t.onboarding.cardBody}
      </p>
      {profileGaps && (
        <p className="text-sm text-slate">
          {profileGaps}{' '}
          <Link
            to="/profile/edit"
            className={`${LINK_CLASS} whitespace-nowrap`}
          >
            {t.profile.editProfile}
          </Link>
        </p>
      )}
      {!empty && (
        <Link to="/onboarding" className={LINK_CLASS}>
          {t.onboarding.cardOpen}
        </Link>
      )}
    </Card>
  );
}
