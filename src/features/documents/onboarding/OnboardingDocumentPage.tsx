import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Banner, Button, Card, Spinner } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import type { Locale } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSession } from '@/auth/SessionProvider';
import { useMyProfile } from '@/features/instructor/api';
import {
  downloadPresigned,
  getMySignedUrl,
  todayIso,
  type Assignment,
  type CompleteRequest,
  type DocumentLanguage,
  type TemplateKind,
} from '../api';
import { DocumentLanguageSwitch } from '../signer/DocumentLanguageSwitch';
import { ReadDocument } from '../signer/ReadDocument';
import { SignerDocument } from '../signer/SignerDocument';
import { clearSigningDraft, signingDraftKey } from '../signer/signingDraft';
import { PdfPages } from '../pdf/PdfPages';
import { useSourceRecovery, type SourceRecovery } from '../pdf/presignedSource';
import { useCompleteMyDocument, useMyDocument } from './queries';
import { LockedBanner, lockReasonOf } from './Locked';

function BackLink({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <Link
      to="/onboarding"
      className={cn(
        'font-medium text-navy hover:text-red',
        compact ? 'text-xs' : 'text-sm',
      )}
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
      const signed = await downloadPresigned(() =>
        getMySignedUrl(assignmentId),
      );
      setSha256(signed.sha256);
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
  sourceUrl,
  sourceRecovery,
}: {
  kind: TemplateKind;
  assignment: Assignment;
  sourceUrl: string | null;
  sourceRecovery: SourceRecovery;
}) {
  const t = useT();
  if (kind === 'read')
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl">{t.onboarding.readDoneTitle}</h2>
          <p className="text-sm text-slate">{t.onboarding.readDoneBody}</p>
          <BackLink />
        </Card>
        {sourceUrl && (
          <div className="rounded-lg bg-sunken p-2 sm:p-4">
            <PdfPages
              source={sourceUrl}
              onLoad={sourceRecovery.onLoad}
              onError={sourceRecovery.onError}
            />
          </div>
        )}
      </div>
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

function languageOfLocale(locale: Locale): DocumentLanguage {
  return locale === 'zh-CN' ? 'zh' : 'en';
}

function useLocalizedDocument(assignmentId: string, locale: Locale) {
  const [choice, setChoice] = useState<DocumentLanguage | null>(null);
  const [choiceLocale, setChoiceLocale] = useState(locale);
  const localeChanged = choiceLocale !== locale;
  if (localeChanged) {
    setChoiceLocale(locale);
    setChoice(null);
  }
  const wanted = (localeChanged ? null : choice) ?? languageOfLocale(locale);
  const [requested, setRequested] = useState(wanted);
  const doc = useMyDocument(assignmentId, requested);
  const served = doc.data;
  if (
    wanted !== requested &&
    (!served ||
      (served.availableLanguages.includes(wanted) &&
        served.language !== wanted))
  )
    setRequested(wanted);
  return { doc, choose: setChoice };
}

/** `/onboarding/:assignmentId` — read or sign one assigned document. */
export function OnboardingDocumentPage() {
  const { assignmentId = '' } = useParams();
  const t = useT();
  const { locale } = useLocale();
  const { user } = useSession();
  const profile = useMyProfile();
  const { doc, choose } = useLocalizedDocument(assignmentId, locale);
  const complete = useCompleteMyDocument(assignmentId);
  const [completed, setCompleted] = useState<Assignment | null>(null);
  const sourceRecovery = useSourceRecovery(doc);

  if (doc.isLoading || (doc.isStale && doc.isFetching))
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  const lockReason = lockReasonOf(doc.error) ?? lockReasonOf(complete.error);
  if (lockReason)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <LockedBanner reason={lockReason} />
      </div>
    );
  if (doc.isError || !doc.data)
    return (
      <Card className="flex flex-col gap-3">
        <Banner tone="error">{t.signer.loadFailed}</Banner>
        <BackLink />
      </Card>
    );

  const {
    assignment,
    template,
    sourceUrl,
    consentText,
    language,
    availableLanguages,
  } = doc.data;
  const title = localizeField(template.titleEn, template.titleZh, locale);
  const done =
    completed ?? (assignment.status === 'completed' ? assignment : null);
  const submitError = complete.error
    ? complete.error instanceof ApiError && complete.error.status === 409
      ? t.onboarding.alreadyCompleted
      : t.signer.submitFailed
    : null;
  const draftKey = user?.id
    ? signingDraftKey(user.id, assignment.id, language)
    : null;
  const onDone = (result: { assignment: Assignment }) => {
    if (user?.id)
      for (const version of [null, ...availableLanguages])
        clearSigningDraft(signingDraftKey(user.id, assignment.id, version));
    setCompleted(result.assignment);
  };
  const submit = (body: CompleteRequest) =>
    complete.mutate(language ? { ...body, language } : body, {
      onSuccess: onDone,
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <BackLink />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl">{title}</h1>
          {(!done || template.kind === 'read') &&
            availableLanguages.length > 1 && (
              <DocumentLanguageSwitch
                languages={availableLanguages}
                value={language}
                label={t.onboarding.documentLanguage}
                labels={{
                  zh: t.onboarding.documentLanguageZh,
                  en: t.onboarding.documentLanguageEn,
                }}
                onChange={choose}
              />
            )}
        </div>
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
        <CompletedView
          kind={template.kind}
          assignment={done}
          sourceUrl={sourceUrl}
          sourceRecovery={sourceRecovery}
        />
      ) : !sourceUrl ? (
        <Card className="flex flex-col gap-3">
          <Banner tone="error">{t.onboarding.sourceUnavailable}</Banner>
          <BackLink />
        </Card>
      ) : template.kind === 'read' ? (
        <ReadDocument
          key={language ?? ''}
          sourceUrl={sourceUrl}
          text={{
            ack: t.onboarding.readAck,
            submit: t.onboarding.readSubmit,
            scrollHint: t.onboarding.readScrollHint,
          }}
          submitting={complete.isPending}
          submitError={submitError}
          onSubmit={submit}
          sourceRecovery={sourceRecovery}
        />
      ) : profile.isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-7 w-7" />
        </div>
      ) : (
        <SignerDocument
          key={language ?? ''}
          template={template}
          sourceUrl={sourceUrl}
          defaultSignerName={
            assignment.signerName ??
            profile.data?.legalName ??
            profile.data?.displayNameEn ??
            ''
          }
          signerEmail={profile.data?.email ?? user?.email ?? null}
          signingDate={todayIso()}
          consentText={consentText}
          locale={locale}
          text={t.signer}
          submitting={complete.isPending}
          submitError={submitError}
          onSubmit={submit}
          backAction={<BackLink compact />}
          draftKey={draftKey}
          sourceRecovery={sourceRecovery}
        />
      )}
    </div>
  );
}
