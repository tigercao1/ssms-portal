import { useState, type FormEvent } from 'react';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Spinner,
} from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { downloadPresigned, getAssignmentSignedUrl } from '../api';
import { errorText, languageName, templateTitle } from '../admin/format';
import {
  SEARCH_QUERY_MAX,
  SIGNATURE_QUERY_MIN,
  useDebounced,
  useSignatureLookup,
  type SignedDocumentEntry,
  type Signer,
} from './api';
import { formatSignedDate } from './format';

export function SignaturesPage() {
  const t = useT();
  const s = t.signatures;
  const [draft, setDraft] = useState('');
  const q = useDebounced(draft.trim());
  const results = useSignatureLookup(q);
  const short = q.length < SIGNATURE_QUERY_MIN;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-1">
        <h1 className="text-3xl">{s.title}</h1>
        <p className="text-slate">{s.intro}</p>
      </div>
      <Card>
        <form role="search" onSubmit={(e: FormEvent) => e.preventDefault()}>
          <Field label={s.searchLabel} hint={s.searchHint}>
            {(p) => (
              <Input
                {...p}
                type="search"
                autoComplete="off"
                maxLength={SEARCH_QUERY_MAX}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </Field>
        </form>
      </Card>
      {short ? (
        <p role="status" className="text-sm text-slate">
          {q ? s.tooShort : s.start}
        </p>
      ) : results.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : results.isError ? (
        <Banner tone="error">
          {errorText(results.error, t.errors.generic)}
        </Banner>
      ) : results.data?.length === 0 ? (
        <EmptyState title={s.empty.replace('{q}', q)} />
      ) : (
        <ul
          aria-label={s.resultsLabel}
          aria-busy={results.isPlaceholderData}
          data-private
          className={cn(
            'flex flex-col gap-4 transition-opacity',
            results.isPlaceholderData && 'opacity-60',
          )}
        >
          {results.data?.map((signer) => (
            <SignerCard
              key={`${signer.subjectType}:${signer.subjectId}`}
              signer={signer}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SignerCard({ signer }: { signer: Signer }) {
  const t = useT();
  const s = t.signatures;
  const name = signer.name || signer.email || s.noName;
  return (
    <li aria-label={name}>
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{name}</h2>
          <span className="whitespace-nowrap rounded-sm bg-navy-tint px-2 py-0.5 text-xs font-medium text-navy">
            {signer.subjectType === 'instructor' ? s.instructor : s.customer}
          </span>
        </div>
        {signer.email && (
          <p className="-mt-2 break-all font-mono text-xs text-slate">
            {signer.email}
          </p>
        )}
        {signer.signatures.length === 0 ? (
          <p className="text-sm text-slate">{s.noSignatures}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-grey/40 border-t border-grey/40">
            {signer.signatures.map((entry) => (
              <SignatureRow
                key={entry.assignmentId}
                entry={entry}
                name={name}
              />
            ))}
          </ul>
        )}
      </Card>
    </li>
  );
}

function SignatureRow({
  entry,
  name,
}: {
  entry: SignedDocumentEntry;
  name: string;
}) {
  const t = useT();
  const s = t.signatures;
  const { locale } = useLocale();
  const title = templateTitle(entry, locale);
  const details = [
    entry.language && languageName(entry.language, t),
    entry.formVersion !== null &&
      s.version.replace('{n}', String(entry.formVersion)),
    (entry.kind === 'read' ? s.readOn : s.signedOn).replace(
      '{date}',
      formatSignedDate(entry.signedAt, locale),
    ),
  ].filter(Boolean);
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-ink">{title}</span>
        <span className="text-xs text-slate">{details.join(' · ')}</span>
      </div>
      {entry.hasSignedCopy && (
        <DownloadButton
          assignmentId={entry.assignmentId}
          label={s.downloadFor
            .replace('{title}', title)
            .replace('{name}', name)}
        />
      )}
    </li>
  );
}

function DownloadButton({
  assignmentId,
  label,
}: {
  assignmentId: string;
  label: string;
}) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function download() {
    setError(null);
    setPending(true);
    try {
      await downloadPresigned(() => getAssignmentSignedUrl(assignmentId));
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start sm:items-end">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        aria-label={label}
        onClick={download}
      >
        {t.signatures.download}
      </Button>
      {error !== null && (
        <p role="alert" className="mt-1 text-xs text-status-rejected">
          {t.signatures.downloadFailed.replace(
            '{reason}',
            errorText(error, t.errors.generic),
          )}
        </p>
      )}
    </div>
  );
}
