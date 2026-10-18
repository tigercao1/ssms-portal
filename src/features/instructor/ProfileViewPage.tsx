import { Link } from 'react-router-dom';
import { useT } from '@/i18n/core/I18nProvider';
import {
  Banner,
  Button,
  Card,
  Spinner,
  StatusBanner,
  StatusPill,
} from '@/components';
import { useMyGoLive, useMyProfile } from './api';
import { GoLiveBanner, LivePill } from './goLive';
import { ProfileSummary } from './ProfileSummary';
import { PreferredLanguageCard } from './PreferredLanguageCard';
import { CalendarStatusCard } from './CalendarStatusCard';
import { OnboardingCard } from '@/features/documents/onboarding/OnboardingCard';
import type { InstructorProfile } from '@/lib/types';

function profileStatus(profile: InstructorProfile) {
  if (!profile.isActive) return 'deactivated';
  switch (profile.approvalStatus) {
    case 'rejected':
      return 'rejected';
    default:
      return 'pending_approval';
  }
}

/** W2.1 — instructor self profile view + status banner. */
export function ProfileViewPage() {
  const t = useT();
  const { data: profile, isLoading, isError } = useMyProfile();
  const goLiveEnabled = Boolean(
    profile && profile.approvalStatus === 'approved' && profile.isActive,
  );
  const goLive = useMyGoLive(Boolean(profile));
  const readiness = goLiveEnabled ? goLive.data : undefined;

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  if (isError || !profile)
    return (
      <Card>
        <Banner tone="error">{t.errors.generic}</Banner>
      </Card>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="whitespace-nowrap text-3xl">{t.profile.title}</h1>
          <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <StatusPill
              status={profile.approvalStatus}
              isActive={profile.isActive}
            />
            {readiness && <LivePill live={readiness.live} />}
          </div>
        </div>
        <Link to="/profile/edit">
          <Button>{t.profile.editProfile}</Button>
        </Link>
      </div>

      {goLiveEnabled ? (
        readiness && <GoLiveBanner readiness={readiness} />
      ) : (
        <StatusBanner surface="profile" reason={profileStatus(profile)} />
      )}
      <PreferredLanguageCard profile={profile} />
      <OnboardingCard />
      <CalendarStatusCard enabled={profile.approvalStatus === 'approved'} />
      <ProfileSummary
        profile={profile}
        certStatuses={goLive.data?.certifications}
      />
    </div>
  );
}
