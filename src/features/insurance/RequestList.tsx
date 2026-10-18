import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Card } from '@/components';
import { formatDate } from '@/lib/date';
import { cn } from '@/lib/cn';
import { LessonTree, treeLessonOf, useInsuranceText } from './LessonTree';
import { RecordStatusCell, RequestStatusPill } from './RecordStatus';
import { dollars, fill } from './money';
import type { InsuranceRecord, InsuranceRequest } from './types';

type Entry =
  | {
      kind: 'request';
      id: string;
      createdAt: string;
      request: InsuranceRequest;
    }
  | { kind: 'record'; id: string; createdAt: string; record: InsuranceRecord };

export function entriesOf(
  requests: InsuranceRequest[],
  records: InsuranceRecord[],
): Entry[] {
  return [
    ...requests.map(
      (request): Entry => ({
        kind: 'request',
        id: request.id,
        createdAt: request.createdAt,
        request,
      }),
    ),
    ...records.map(
      (record): Entry => ({
        kind: 'record',
        id: record.id,
        createdAt: record.createdAt,
        record,
      }),
    ),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function RequestList({
  requests,
  records,
  highlightId,
  canCreate,
  onNew,
}: {
  requests: InsuranceRequest[];
  records: InsuranceRecord[];
  highlightId: string | null;
  canCreate: boolean;
  onNew: () => void;
}) {
  const f = useInsuranceText();
  const s = f.s;
  const headingId = useId();
  const entries = entriesOf(requests, records);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-lg">
          {s.requestsTitle}
        </h2>
        <span className="text-[13px] text-slate">
          {fill(
            entries.length === 1 ? s.requestsCountOne : s.requestsCountMany,
            { n: entries.length },
          )}
        </span>
      </div>
      {entries.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-5 py-7 text-center">
          <span
            aria-hidden
            className="mb-1 grid h-12 w-12 place-items-center rounded-full bg-navy-tint text-2xl text-navy"
          >
            ⛷
          </span>
          <h3 className="text-base font-semibold text-navy">{s.emptyTitle}</h3>
          <p className="max-w-md text-sm text-slate">{s.emptyBody}</p>
          {canCreate && (
            <Button className="mt-2" onClick={onNew}>
              {s.newRequest}
            </Button>
          )}
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-label={s.requestsTitle}>
          {entries.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              highlighted={e.id === highlightId}
            />
          ))}
        </ul>
      )}
      <p className="mt-1.5 flex items-start gap-2 text-[13px] text-slate">
        <span
          aria-hidden
          className="mt-px grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-navy-tint text-[11px] font-bold italic text-navy"
        >
          i
        </span>
        {s.paymentNote}
      </p>
    </section>
  );
}

function EntryCard({
  entry,
  highlighted,
}: {
  entry: Entry;
  highlighted: boolean;
}) {
  const f = useInsuranceText();
  const s = f.s;
  const [open, setOpen] = useState(highlighted);
  const ref = useRef<HTMLLIElement>(null);
  const bodyId = useId();

  useEffect(() => {
    if (!highlighted) return;
    setOpen(true);
    const frame = requestAnimationFrame(() =>
      ref.current?.scrollIntoView?.({ block: 'center' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [highlighted]);

  let no: string;
  let meta: string;
  let amount: number;
  let voided: boolean;
  let status: ReactNode;
  let lessons: InsuranceRecord[];
  if (entry.kind === 'request') {
    const r = entry.request;
    no = r.requestNo;
    meta = fill(s.entryMeta, {
      date: formatDate(r.createdAt, f.locale),
      lessons: f.lessons(r.lessonCount),
      students: f.students(r.studentCount),
    });
    amount = r.totalCents;
    voided = r.paymentStatus === 'voided';
    status = <RequestStatusPill request={r} />;
    lessons = r.lessons;
  } else {
    const r = entry.record;
    no = r.recordNo;
    lessons = r.kind === 'lesson' ? [r] : [];
    meta =
      r.kind === 'season_pass'
        ? s.seasonPassRow
        : fill(s.entryMeta, {
            date: formatDate(r.createdAt, f.locale),
            lessons: f.lessons(1),
            students: f.students(r.students.length),
          });
    amount = r.amountCents;
    voided = r.paymentStatus === 'voided';
    status = <RecordStatusCell record={r} />;
  }
  const expandable = lessons.length > 0;

  const head = (
    <>
      {expandable && (
        <span
          aria-hidden
          className={cn(
            'inline-block w-4 flex-none text-xl text-slate transition-transform',
            open && 'rotate-90',
          )}
        >
          ›
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        {highlighted && (
          <span className="my-0.5 self-start rounded-full bg-red px-1.5 text-[11px] font-bold text-white">
            {s.newTag}
          </span>
        )}
        <span
          data-testid="entry-no"
          className="break-all font-bold tabular-nums text-navy"
        >
          {no}
        </span>
        <span className="text-[12.5px] text-slate">{meta}</span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1">
        <span
          data-testid="entry-total"
          className={cn(
            'text-base font-bold tabular-nums text-navy',
            voided && 'text-slate line-through',
          )}
        >
          {dollars(amount)}
        </span>
        {status}
      </span>
    </>
  );

  return (
    <li
      ref={ref}
      data-testid="entry"
      className={cn(
        'scroll-mt-20 overflow-hidden rounded-lg border-2 bg-surface shadow-card',
        highlighted ? 'border-red' : 'border-transparent',
      )}
    >
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[60px] w-full items-center gap-2.5 px-3.5 py-3 text-left"
        >
          {head}
        </button>
      ) : (
        <div className="flex min-h-[60px] w-full items-center gap-2.5 px-3.5 py-3">
          {head}
        </div>
      )}
      {expandable && open && (
        <div
          id={bodyId}
          className="border-t border-grey/40 bg-sunken/40 px-3.5 pb-3 pt-3.5"
        >
          <LessonTree lessons={lessons.map(treeLessonOf)} />
        </div>
      )}
    </li>
  );
}
