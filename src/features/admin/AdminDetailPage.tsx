import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { useSession } from '@/auth/SessionProvider';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Select,
  Spinner,
  StatusPill,
  Textarea,
  Toggle,
} from '@/components';
import {
  useAdminInstructor,
  useAdminUpdateProfile,
  useSetActivation,
  useSetApproval,
  useSetRole,
} from './api';
import type { AdminInstructorRecord, PreferredLanguage } from '@/lib/types';

/** W2.8–W2.12 — admin instructor detail + actions rail. */
export function AdminDetailPage() {
  const { id = '' } = useParams();
  const t = useT();
  const { data: rec, isLoading } = useAdminInstructor(id);

  if (isLoading)
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

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <EditCore key={rec.updatedAt} rec={rec} />
        <ActionsRail rec={rec} />
      </div>
    </div>
  );
}

/** W2.12 — edit core profile fields (relations/certs aren't returned here). */
function EditCore({ rec }: { rec: AdminInstructorRecord }) {
  const t = useT();
  const { locale } = useLocale();
  const update = useAdminUpdateProfile(rec.id);
  const [form, setForm] = useState({
    displayNameEn: rec.displayNameEn,
    displayNameZh: rec.displayNameZh ?? '',
    bioEn: rec.bioEn ?? '',
    bioZh: rec.bioZh ?? '',
    dateOfBirth: rec.dateOfBirth ?? '',
    preferredLanguage: rec.preferredLanguage,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    await update.mutateAsync({
      displayNameEn: form.displayNameEn,
      displayNameZh: form.displayNameZh || null,
      bioEn: form.bioEn || null,
      bioZh: form.bioZh || null,
      dateOfBirth: form.dateOfBirth || null,
      preferredLanguage: form.preferredLanguage,
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">
          {localizeField(rec.displayNameEn, rec.displayNameZh, locale) || rec.email}
        </h1>
      </div>
      <p className="font-mono text-xs text-slate">{rec.email}</p>

      <Field label={t.profile.displayNameEn} required>
        {(p) => (
          <Input
            {...p}
            value={form.displayNameEn}
            onChange={(e) => set('displayNameEn', e.target.value)}
          />
        )}
      </Field>
      <Field label={t.profile.displayNameZh}>
        {(p) => (
          <Input
            {...p}
            value={form.displayNameZh}
            onChange={(e) => set('displayNameZh', e.target.value)}
          />
        )}
      </Field>
      <Field label={t.profile.bioEn}>
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            value={form.bioEn}
            onChange={(e) => set('bioEn', e.target.value)}
          />
        )}
      </Field>
      <Field label={t.profile.bioZh}>
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            value={form.bioZh}
            onChange={(e) => set('bioZh', e.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.profile.dateOfBirth} hint={t.profile.dobHint}>
          {(p) => (
            <Input
              {...p}
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={form.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
            />
          )}
        </Field>
        <Field label={t.settings.languageLabel}>
          {(p) => (
            <Select
              {...p}
              value={form.preferredLanguage}
              onChange={(e) =>
                set('preferredLanguage', e.target.value as PreferredLanguage)
              }
            >
              <option value="en">{t.common.english}</option>
              <option value="zh-CN">{t.common.chinese}</option>
            </Select>
          )}
        </Field>
      </div>

      {update.isError && <Banner tone="error">{t.errors.generic}</Banner>}
      {update.isSuccess && <Banner tone="approved">{t.common.saved}</Banner>}
      <div className="flex justify-end">
        <Button onClick={save} loading={update.isPending}>
          {t.common.save}
        </Button>
      </div>
    </Card>
  );
}

/** W2.9–W2.11 — approve/reject, activate/deactivate, role change. */
function ActionsRail({ rec }: { rec: AdminInstructorRecord }) {
  const t = useT();
  const { user } = useSession();
  const approval = useSetApproval(rec.id);
  const activation = useSetActivation(rec.id);
  const role = useSetRole(rec.authUserId);
  const [reason, setReason] = useState('');

  const isSelf = user?.id === rec.authUserId;

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

        <div className="flex items-center justify-between border-t border-grey/40 pt-3">
          <span className="text-sm text-navy">
            {rec.isActive ? t.admin.deactivate : t.admin.activate}
          </span>
          <Toggle
            checked={rec.isActive}
            onChange={(v) => activation.mutate(v)}
            label={t.admin.activate}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg">{t.admin.roleSection}</h2>
        {isSelf ? (
          <Banner tone="info">{t.admin.cantChangeOwnRole}</Banner>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              onClick={() => role.mutate('admin')}
              loading={role.isPending}
            >
              {t.admin.makeAdmin}
            </Button>
            <Button
              variant="ghost"
              onClick={() => role.mutate('instructor')}
              loading={role.isPending}
            >
              {t.admin.makeInstructor}
            </Button>
            {role.isSuccess && (
              <Banner tone="approved">{t.admin.actionDone}</Banner>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
