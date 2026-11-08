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
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Chip } from '../admin/badges';
import { LockedBanner, lockReasonOf } from '../onboarding/Locked';
import {
  SEARCH_QUERY_MAX,
  STUDENT_LOOKUP_LIMIT,
  useDebounced,
  useMyStudentSignatures,
  type StudentSignature,
} from './api';
import { formatSignedDate } from './format';

export function MyStudentsPage() {
  const t = useT();
  const s = t.myStudents;
  const [draft, setDraft] = useState('');
  const q = useDebounced(draft.trim());
  const students = useMyStudentSignatures(q);
  const lockReason = lockReasonOf(students.error);
  const noProfile =
    students.error instanceof ApiError && students.error.status === 404;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-1">
        <h1 className="text-3xl">{s.title}</h1>
        <p className="text-slate">{s.intro}</p>
      </div>
      {lockReason || noProfile ? (
        <LockedBanner reason={lockReason ?? 'pending_approval'} />
      ) : (
        <>
          <Card className="p-4 sm:p-6">
            <form role="search" onSubmit={(e: FormEvent) => e.preventDefault()}>
              <Field label={s.searchLabel}>
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
          {students.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : students.isError || !students.data ? (
            <Card>
              <Banner tone="error">{s.loadFailed}</Banner>
              <Button
                className="mt-4"
                variant="secondary"
                size="sm"
                onClick={() => void students.refetch()}
              >
                {t.common.retry}
              </Button>
            </Card>
          ) : students.data.length === 0 ? (
            <EmptyState title={q ? s.noMatches.replace('{q}', q) : s.empty} />
          ) : (
            <StudentList
              rows={students.data}
              busy={students.isPlaceholderData}
            />
          )}
        </>
      )}
    </div>
  );
}

function StudentList({
  rows,
  busy,
}: {
  rows: StudentSignature[];
  busy: boolean;
}) {
  const t = useT();
  const s = t.myStudents;
  const { locale } = useLocale();
  return (
    <div className="flex flex-col gap-2">
      <Card className="p-0">
        <ul
          aria-label={s.listLabel}
          aria-busy={busy}
          data-private
          className={cn(
            'flex flex-col divide-y divide-grey/40 transition-opacity',
            busy && 'opacity-60',
          )}
        >
          {rows.map((row, i) => {
            const name = row.name || s.noName;
            return (
              <li
                key={`${name}-${i}`}
                aria-label={name}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="min-w-0 font-medium text-ink">{name}</span>
                <span className="flex items-center gap-3">
                  {row.signed && row.signedAt && (
                    <span className="text-xs text-slate">
                      {formatSignedDate(row.signedAt, locale)}
                    </span>
                  )}
                  <SignedBadge signed={row.signed} />
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      {rows.length >= STUDENT_LOOKUP_LIMIT && (
        <p className="text-sm text-slate">
          {s.capped.replace('{n}', String(STUDENT_LOOKUP_LIMIT))}
        </p>
      )}
    </div>
  );
}

function SignedBadge({ signed }: { signed: boolean }) {
  const t = useT();
  return (
    <Chip
      tone={signed ? 'approved' : 'rejected'}
      label={signed ? t.myStudents.signed : t.myStudents.notSigned}
    />
  );
}
