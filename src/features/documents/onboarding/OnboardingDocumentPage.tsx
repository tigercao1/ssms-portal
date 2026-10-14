import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Banner, Button, Card, Spinner } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { ApiError } from '@/lib/api';
import { useSession } from '@/auth/SessionProvider';
import { useMyProfile } from '@/features/instructor/api';
import {
  getMySignedUrl,
  signingDateIso,
  type Assignment,
  type TemplateKind,
} from '../api';
import { ReadDocument } from '../signer/ReadDocument';
import { SignerDocument } from '../signer/SignerDocument';
import { useCompleteMyDocument, useMyDocument } from './queries';

function BackLink() {
  const t = useT();
  return (
    <Link
      to="/onboarding"
      className="text-sm font-medium text-navy hover:text-red"
    >
      ← {t.onboarding.backToChecklist}
    </Link>
  );
}

function DownloadSigned({ assignmentId }: { assignmentId: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [sha256, setSha256] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(false);
    try {
      const signed = await getMySignedUrl(assignmentId);
      setSha256(signed.sha256);
      window.open(signed.url, '_blank', 'noopener');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        onClick={() => void download()}
        loading={busy}
      >
        {t.onboarding.downloadSigned}
      </Button>
      {sha256 && (
        <p className="break-all font-mono text-xs text-slate">
          {t.onboarding.sha256}: {sha256}
        </p>
      )}
      {error && <Banner tone="error">{t.onboarding.downloadFailed}</Banner>}
    </div>
  );
}

function CompletedView({
  kind,
  assignment,
}: {
  kind: TemplateKind;
  assignment: Assignment;
}) {
  const t = useT();
  if (kind === 'read')
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-xl">{t.onboarding.readDoneTitle}</h2>
        <p className="text-sm text-slate">{t.onboarding.readDoneBody}</p>
        <BackLink />
      </Card>
    );
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-xl">{t.onboarding.signedTitle}</h2>
      <p className="text-sm text-slate">{t.onboarding.signedBody}</p>
      {assignment.signedSha256 && (
        <p className="break-all font-mono text-xs text-slate">
          {t.onboarding.sha256}: {assignment.signedSha256}
        </p>
      )}
      {assignment.hasSignedCopy && (
        <DownloadSigned assignmentId={assignment.id} />
      )}
      <BackLink />
    </Card>
  );
}

/** `/onboarding/:assignmentId` — read or sign one assigned document. */
export function OnboardingDocumentPage() {
  const { assignmentId = '' } = useParams();
  const t = useT();
  const { locale } = useLocale();
  const { user } = useSession();
  const profile = useMyProfile();
  const doc = useMyDocument(assignmentId);
  const complete = useCompleteMyDocument(assignmentId);
  const [completed, setCompleted] = useState<Assignment | null>(null);

  if (doc.isLoading)
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  if (doc.isError || !doc.data)
    return (
      <Card className="flex flex-col gap-3">
        <Banner tone="error">{t.signer.loadFailed}</Banner>
        <BackLink />
      </Card>
    );

  const { assignment, template, sourceUrl, consentText } = doc.data;
  const title = localizeField(template.titleEn, template.titleZh, locale);
  const done =
    completed ?? (assignment.status === 'completed' ? assignment : null);
  const submitError = complete.error
    ? complete.error instanceof ApiError && complete.error.status === 409
      ? t.onboarding.alreadyCompleted
      : t.signer.submitFailed
    : null;
  const onDone = (result: { assignment: Assignment }) =>
    setCompleted(result.assignment);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink />
        <h1 className="text-3xl">{title}</h1>
        {!done && template.descriptionEn && (
          <p className="text-sm text-slate">
            {localizeField(
              template.descriptionEn,
              template.descriptionZh,
              locale,
            )}
          </p>
        )}
      </div>
      {done ? (
        <CompletedView kind={template.kind} assignment={done} />
      ) : !sourceUrl ? (
        <Card className="flex flex-col gap-3">
          <Banner tone="error">{t.onboarding.sourceUnavailable}</Banner>
          <BackLink />
        </Card>
      ) : template.kind === 'read' ? (
        <ReadDocument
          sourceUrl={sourceUrl}
          text={{
            ack: t.onboarding.readAck,
            submit: t.onboarding.readSubmit,
            scrollHint: t.onboarding.readScrollHint,
          }}
          submitting={complete.isPending}
          submitError={submitError}
          onSubmit={(body) => complete.mutate(body, { onSuccess: onDone })}
        />
      ) : profile.isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-7 w-7" />
        </div>
      ) : (
        <SignerDocument
          template={template}
          sourceUrl={sourceUrl}
          defaultSignerName={
            assignment.signerName ?? profile.data?.displayNameEn ?? ''
          }
          signerEmail={profile.data?.email ?? user?.email ?? null}
          signingDate={signingDateIso()}
          consentText={consentText}
          locale={locale}
          text={t.signer}
          submitting={complete.isPending}
          submitError={submitError}
          onSubmit={(body) => complete.mutate(body, { onSuccess: onDone })}
        />
      )}
    </div>
  );
}
