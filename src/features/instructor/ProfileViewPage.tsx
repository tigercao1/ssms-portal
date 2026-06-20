import { Link } from 'react-router-dom';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Card, Spinner, StatusPill } from '@/components';
import { useMyProfile } from './api';
import { ProfileSummary } from './ProfileSummary';
import type { InstructorProfile } from '@/lib/types';

function statusBanner(profile: InstructorProfile, t: ReturnType<typeof useT>) {
  if (profile.approvalStatus === 'approved' && !profile.isActive)
    return <Banner tone="info">{t.profile.inactiveBanner}</Banner>;
  switch (profile.approvalStatus) {
    case 'approved':
      return <Banner tone="approved">{t.profile.approvedBanner}</Banner>;
    case 'rejected':
      return <Banner tone="rejected">{t.profile.rejectedBanner}</Banner>;
    default:
      return <Banner tone="pending">{t.profile.pendingBanner}</Banner>;
  }
}

/** W2.1 — instructor self profile view + status banner. */
export function ProfileViewPage() {
  const t = useT();
  const { data: profile, isLoading, isError } = useMyProfile();

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl">{t.profile.title}</h1>
          <StatusPill
            status={profile.approvalStatus}
            isActive={profile.isActive}
          />
        </div>
        <Link to="/profile/edit">
          <Button>{t.profile.editProfile}</Button>
        </Link>
      </div>

      {statusBanner(profile, t)}
      <ProfileSummary profile={profile} />
    </div>
  );
}
