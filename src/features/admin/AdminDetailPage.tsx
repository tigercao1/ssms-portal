import { useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { useSession } from '@/auth/SessionProvider';
import {
  Banner,
  Button,
  Card,
  Field,
  Spinner,
  StatusPill,
  Textarea,
} from '@/components';
import {
  useAdminInstructor,
  useAdminInstructorProfile,
  useAdminUserRole,
  useSetActivation,
  useSetApproval,
  useSetRole,
} from './api';
import { AdminProfileEditor } from './AdminProfileEditor';
import type { AdminInstructorRecord, UserRole } from '@/lib/types';

/** W2.8–W2.12 — admin instructor detail + actions rail. */
export function AdminDetailPage() {
  const { id = '' } = useParams();
  const t = useT();
  const { locale } = useLocale();
  const { data: rec, isLoading } = useAdminInstructor(id);
  const profile = useAdminInstructorProfile(id);

  if (isLoading || profile.isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7" />
      </div>
    );
  if (!rec)
    return (
      <Card>
        <Banner tone="error">{t.errors.generic}</Banner>
      </Card>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to="/admin/instructors" className="text-sm text-navy hover:underline">
          ← {t.admin.listTitle}
        </Link>
        <StatusPill status={rec.approvalStatus} isActive={rec.isActive} />
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">
          {localizeField(rec.displayNameEn, rec.displayNameZh, locale) || rec.email}
        </h1>
        <p className="font-mono text-xs text-slate">{rec.email}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {profile.data ? (
          <AdminProfileEditor instructorId={rec.id} profile={profile.data} />
        ) : (
          <Card>
            <Banner tone="error">{t.errors.generic}</Banner>
          </Card>
        )}
        <ActionsRail rec={rec} />
      </div>
    </div>
  );
}

/** W2.9–W2.11 — approve/reject, activate/deactivate, role change. */
function ActionsRail({ rec }: { rec: AdminInstructorRecord }) {
  const t = useT();
  const approval = useSetApproval(rec.id);
  const [reason, setReason] = useState('');

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg">{t.admin.actions}</h2>

        {rec.approvalStatus === 'pending' && (
          <>
            <Button
              onClick={() => approval.mutate({ approvalStatus: 'approved' })}
              loading={approval.isPending}
            >
              {t.admin.approve}
            </Button>
            <Field label={t.admin.rejectReason}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </Field>
            <Button
              variant="danger"
              onClick={() =>
                approval.mutate({
                  approvalStatus: 'rejected',
                  reason: reason || undefined,
                })
              }
              loading={approval.isPending}
            >
              {t.admin.reject}
            </Button>
          </>
        )}

        <VisibilityAction rec={rec} />
      </Card>

      <RoleCard authUserId={rec.authUserId} />
    </div>
  );
}

function VisibilityAction({ rec }: { rec: AdminInstructorRecord }) {
  const t = useT();
  const activation = useSetActivation(rec.id);
  const [confirming, setConfirming] = useState(false);

  if (rec.isActive && rec.approvalStatus !== 'approved') return null;
  const goOnline = !rec.isActive;

  return (
    <div className="flex flex-col gap-2 border-t border-grey/40 pt-3">
      {confirming ? (
        <>
          <p className="text-sm text-navy">
            {goOnline ? t.admin.putOnlineConfirm : t.admin.takeOfflineConfirm}
          </p>
          <div className="flex gap-2">
            <Button
              variant={goOnline ? 'primary' : 'danger'}
              loading={activation.isPending}
              onClick={() =>
                activation.mutate(goOnline, {
                  onSuccess: () => setConfirming(false),
                })
              }
            >
              {t.admin.confirm}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t.common.cancel}
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant={goOnline ? 'secondary' : 'danger'}
          onClick={() => setConfirming(true)}
        >
          {goOnline ? t.admin.putOnline : t.admin.takeOffline}
        </Button>
      )}
      {activation.isError && <Banner tone="error">{t.errors.generic}</Banner>}
    </div>
  );
}

function RoleCard({ authUserId }: { authUserId: string }) {
  const t = useT();
  const { user } = useSession();
  const current = useAdminUserRole(authUserId);
  const role = useSetRole(authUserId);
  const currentRole = current.data?.role;
  const isSelf = user?.id === authUserId;
  const hintId = useId();

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">{t.admin.roleSection}</h2>
        {currentRole && <RolePill role={currentRole} />}
      </div>
      {current.isError && <Banner tone="error">{t.errors.generic}</Banner>}
      {isSelf ? (
        <Banner tone="info">{t.admin.cantChangeOwnRole}</Banner>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            onClick={() => role.mutate('admin')}
            loading={role.isPending}
            disabled={currentRole !== 'instructor'}
            aria-describedby={currentRole === 'admin' ? hintId : undefined}
          >
            {t.admin.makeAdmin}
          </Button>
          <Button
            variant="ghost"
            onClick={() => role.mutate('instructor')}
            loading={role.isPending}
            disabled={currentRole !== 'admin'}
            aria-describedby={
              currentRole === 'instructor' ? hintId : undefined
            }
          >
            {t.admin.makeInstructor}
          </Button>
          {currentRole && (
            <p id={hintId} className="text-xs text-slate">
              {currentRole === 'admin'
                ? t.admin.alreadyAdmin
                : t.admin.alreadyInstructor}
            </p>
          )}
          {role.isError && <Banner tone="error">{t.errors.generic}</Banner>}
          {role.isSuccess && (
            <Banner tone="approved">{t.admin.actionDone}</Banner>
          )}
        </div>
      )}
    </Card>
  );
}

function RolePill({ role }: { role: UserRole }) {
  const t = useT();
  return (
    <span className="rounded-sm bg-navy-tint px-2 py-0.5 text-xs font-medium text-navy">
      {role === 'admin' ? t.admin.roleAdmin : t.admin.roleInstructor}
    </span>
  );
}
