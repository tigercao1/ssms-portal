import { useId } from 'react';
import { Button, Input, Select } from '@/components';
import { localizeField } from '@/i18n/core/localize';
import { cn } from '@/lib/cn';
import { useTeachingLocations } from '@/features/reference/api';
import type { RefItem } from '@/lib/types';
import {
  duplicateLesson,
  MAX_LESSONS,
  MAX_STUDENTS,
  newLesson,
  newStudent,
  OTHER_LOCATION,
  type DraftIssue,
  type DraftLesson,
  type InsuranceDraft,
} from './draft';
import { PriceLabel, useInsuranceText } from './LessonTree';
import type { LessonPrice } from './money';
import { fill } from './money';
import type { Locale } from '@/i18n/core/types';

export const WAIVER_URL_ZH = 'https://ssnow.club/pages/waiver';
export const WAIVER_URL_EN = 'https://ssnow.club/en/pages/waiver';

type Update = (recipe: (draft: InsuranceDraft) => InsuranceDraft) => void;

function fieldSelector(issue: DraftIssue) {
  switch (issue.field) {
    case 'date':
      return `[data-field="date"][data-lesson="${issue.lessonId}"]`;
    case 'students':
      return `[data-field="add-student"][data-lesson="${issue.lessonId}"]`;
    default:
      return `[data-field="${issue.field}"][data-student="${issue.studentId}"]`;
  }
}

function afterRender(fn: () => void) {
  setTimeout(fn, 0);
}

export function jumpToIssue(
  issue: DraftIssue,
  draft: InsuranceDraft,
  update: Update,
) {
  if (draft.lessons.find((l) => l.id === issue.lessonId)?.collapsed)
    update((d) => ({
      ...d,
      lessons: d.lessons.map((l) =>
        l.id === issue.lessonId ? { ...l, collapsed: false } : l,
      ),
    }));
  afterRender(() => {
    const row = issue.studentId
      ? document.querySelector<HTMLElement>(
          `[data-student-row="${issue.studentId}"]`,
        )
      : null;
    const card = document.querySelector<HTMLElement>(
      `[data-lesson-card="${issue.lessonId}"]`,
    );
    (row ?? card)?.scrollIntoView?.({ block: 'center' });
    document
      .querySelector<HTMLElement>(fieldSelector(issue))
      ?.focus({ preventScroll: true });
  });
}

function locationName(
  lesson: DraftLesson,
  locations: RefItem[],
  other: string,
  locale: Locale,
) {
  if (lesson.location === OTHER_LOCATION)
    return lesson.locationOther.trim() || other;
  const loc = locations.find((l) => l.id === lesson.location);
  return loc
    ? localizeField(loc.name, loc.nameZh ?? null, locale) || loc.name
    : null;
}

export function useLocationName() {
  const locations = useTeachingLocations();
  const f = useInsuranceText();
  return (lesson: DraftLesson) =>
    locationName(lesson, locations.data ?? [], f.s.skiAreaOther, f.locale);
}

export function DraftEditor({
  draft,
  update,
  issues,
  priced,
  seasonPass,
  onToast,
}: {
  draft: InsuranceDraft;
  update: Update;
  issues: DraftIssue[];
  priced: LessonPrice[];
  seasonPass: boolean;
  onToast: (message: string) => void;
}) {
  const f = useInsuranceText();
  const s = f.s;
  const full = draft.lessons.length >= MAX_LESSONS;
  const shown = draft.showErrors ? issues : issues.filter((x) => x.live);

  function addLesson() {
    if (full) return;
    const lesson = newLesson();
    update((d) => ({
      ...d,
      lessons: [
        ...d.lessons.map((l) =>
          validateLesson(l) ? { ...l, collapsed: true } : l,
        ),
        lesson,
      ],
    }));
    afterRender(() => {
      document
        .querySelector<HTMLElement>(`[data-lesson-card="${lesson.id}"]`)
        ?.scrollIntoView?.({ block: 'center' });
      document
        .querySelector<HTMLElement>(
          `[data-field="date"][data-lesson="${lesson.id}"]`,
        )
        ?.focus({ preventScroll: true });
    });
  }

  function validateLesson(l: DraftLesson) {
    return (
      Boolean(l.lessonDate) &&
      l.students.length > 0 &&
      l.students.every((st) => st.name.trim() && st.waiverConfirmed)
    );
  }

  function duplicate(lesson: DraftLesson) {
    if (full) return;
    const copy = duplicateLesson(lesson);
    const index = draft.lessons.findIndex((l) => l.id === lesson.id);
    update((d) => {
      const lessons = d.lessons.map((l) =>
        l.id === lesson.id ? { ...l, collapsed: true } : l,
      );
      lessons.splice(index + 1, 0, copy);
      return { ...d, lessons };
    });
    onToast(fill(s.duplicated, { n: index + 2 }));
    afterRender(() =>
      document
        .querySelector<HTMLElement>(`[data-lesson-card="${copy.id}"]`)
        ?.scrollIntoView?.({ block: 'center' }),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <WaiverLinks onToast={onToast} />
      {shown.length > 0 && (
        <div
          role="alert"
          data-testid="error-box"
          className="rounded-md bg-red-tint px-3.5 py-2.5"
        >
          <p className="text-sm font-bold text-red">{s.errorsTitle}</p>
          {shown.map((issue, i) => (
            <button
              key={i}
              type="button"
              onClick={() => jumpToIssue(issue, draft, update)}
              className="block min-h-10 w-full py-1 text-left text-sm font-semibold text-red underline"
            >
              {issue.message}
            </button>
          ))}
        </div>
      )}
      {draft.lessons.length === 0 && (
        <p
          data-testid="draft-empty"
          className="rounded-lg border-[1.5px] border-dashed border-grey px-4 py-4 text-center text-sm text-slate"
        >
          {s.draftEmpty}
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {draft.lessons.map((lesson, i) => (
          <LessonEditor
            key={lesson.id}
            lesson={lesson}
            index={i}
            price={priced[i]!}
            seasonPass={seasonPass}
            issues={shown.filter((x) => x.lessonId === lesson.id)}
            canDuplicate={!full}
            update={update}
            onDuplicate={() => duplicate(lesson)}
          />
        ))}
      </ol>
      <Button
        type="button"
        variant="secondary"
        data-testid="add-lesson"
        disabled={full}
        onClick={addLesson}
        className="w-full border-[1.5px] border-dashed border-grey hover:border-navy"
      >
        {s.addLesson}
      </Button>
      {full && (
        <p className="text-center text-[13px] text-slate">
          {fill(s.maxLessons, { max: MAX_LESSONS })}
        </p>
      )}
    </div>
  );
}

function WaiverLinks({ onToast }: { onToast: (message: string) => void }) {
  const f = useInsuranceText();
  const s = f.s;
  async function copy(url: string, done: string) {
    try {
      await navigator.clipboard.writeText(url);
      onToast(`${done}: ${url}`);
    } catch {
      onToast(s.copyFailed);
    }
  }
  const mini =
    'h-10 rounded-md border border-grey/60 bg-surface px-2.5 text-[12.5px] font-semibold text-navy hover:border-navy';
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-status-approved/10 px-3 py-2">
      <p className="min-w-0 flex-1 basis-48 text-[12.5px] text-ink">
        {s.copyHint}
      </p>
      <span className="flex gap-1.5">
        <button
          type="button"
          className={mini}
          aria-label={s.copyZh}
          title={s.copyZh}
          onClick={() => void copy(WAIVER_URL_ZH, s.copiedZh)}
        >
          ⧉ 中文
        </button>
        <button
          type="button"
          className={mini}
          aria-label={s.copyEn}
          title={s.copyEn}
          onClick={() => void copy(WAIVER_URL_EN, s.copiedEn)}
        >
          ⧉ EN
        </button>
      </span>
    </div>
  );
}

function LessonEditor({
  lesson,
  index,
  price,
  seasonPass,
  issues,
  canDuplicate,
  update,
  onDuplicate,
}: {
  lesson: DraftLesson;
  index: number;
  price: LessonPrice;
  seasonPass: boolean;
  issues: DraftIssue[];
  canDuplicate: boolean;
  update: Update;
  onDuplicate: () => void;
}) {
  const f = useInsuranceText();
  const s = f.s;
  const id = useId();
  const locations = useTeachingLocations();
  const placeOf = useLocationName();
  const n = index + 1;
  const lessonIssues = lesson.collapsed
    ? issues
    : issues.filter((x) => !x.studentId);

  function patch(change: Partial<DraftLesson>) {
    update((d) => ({
      ...d,
      lessons: d.lessons.map((l) =>
        l.id === lesson.id ? { ...l, ...change } : l,
      ),
    }));
  }
  function patchStudent(
    studentId: string,
    change: Partial<DraftLesson['students'][number]>,
  ) {
    update((d) => ({
      ...d,
      lessons: d.lessons.map((l) =>
        l.id === lesson.id
          ? {
              ...l,
              students: l.students.map((st) =>
                st.id === studentId ? { ...st, ...change } : st,
              ),
            }
          : l,
      ),
    }));
  }
  function addStudent() {
    const student = newStudent();
    patch({ students: [...lesson.students, student] });
    afterRender(() =>
      document
        .querySelector<HTMLElement>(
          `[data-field="name"][data-student="${student.id}"]`,
        )
        ?.focus(),
    );
  }

  const summary = [
    f.day(lesson.lessonDate),
    f.hours(lesson.durationHours),
    placeOf(lesson),
    f.students(lesson.students.length),
  ]
    .filter(Boolean)
    .join(' · ');
  const label = 'mb-1 block text-[12.5px] font-semibold text-slate';

  return (
    <li
      data-lesson-card={lesson.id}
      data-testid="lesson"
      aria-invalid={issues.length > 0}
      className={cn(
        'scroll-mt-24 rounded-lg border-2 bg-surface px-3.5 pb-3 pt-2.5 shadow-card',
        issues.length > 0 ? 'border-status-rejected' : 'border-transparent',
      )}
    >
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <div className="min-w-0 flex-[1_1_13rem] pt-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h3 className="m-0 text-[15px] font-bold text-navy">
              {fill(s.lessonN, { n })}
            </h3>
            <PriceLabel
              listCents={price.listCents}
              amountCents={price.amountCents}
              seasonPass={seasonPass}
            />
          </div>
          <p className="break-words text-[13px] text-slate">{summary}</p>
        </div>
        <div className="ml-auto flex flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={!lesson.collapsed}
            onClick={() => patch({ collapsed: !lesson.collapsed })}
          >
            {lesson.collapsed ? s.expand : s.collapse}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!canDuplicate}
            onClick={onDuplicate}
          >
            {s.duplicate}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-red"
            onClick={() =>
              update((d) => ({
                ...d,
                lessons: d.lessons.filter((l) => l.id !== lesson.id),
              }))
            }
          >
            {s.remove}
          </Button>
        </div>
      </div>
      {lessonIssues.length > 0 && (
        <div data-testid="lesson-error">
          {lessonIssues.map((x, i) => (
            <p key={i} className="mt-1 text-[13px] font-semibold text-red">
              {x.message}
            </p>
          ))}
        </div>
      )}
      {!lesson.collapsed && (
        <div>
          <div className="my-2 grid gap-x-3.5 gap-y-2.5 min-[561px]:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={`${id}-date`} className={label}>
                {s.lessonDate}
              </label>
              <Input
                id={`${id}-date`}
                type="date"
                data-field="date"
                data-lesson={lesson.id}
                value={lesson.lessonDate}
                aria-invalid={issues.some((x) => x.field === 'date')}
                onChange={(e) => patch({ lessonDate: e.target.value })}
              />
            </div>
            <div className="min-w-0">
              <span id={`${id}-dur`} className={label}>
                {s.duration}
              </span>
              <div
                role="group"
                aria-labelledby={`${id}-dur`}
                className="grid h-11 grid-cols-2 overflow-hidden rounded-md border border-grey"
              >
                {([1, 2] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={lesson.durationHours === h}
                    onClick={() => patch({ durationHours: h })}
                    className={cn(
                      'text-sm',
                      h === 2 && 'border-l border-grey',
                      lesson.durationHours === h
                        ? 'bg-navy font-semibold text-white'
                        : 'bg-surface text-ink hover:bg-sunken',
                    )}
                  >
                    {f.hours(h)}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <label htmlFor={`${id}-area`} className={label}>
                {s.skiArea}
              </label>
              <Select
                id={`${id}-area`}
                value={lesson.location}
                onChange={(e) => patch({ location: e.target.value })}
              >
                <option value="">{s.skiAreaNone}</option>
                {(locations.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {localizeField(l.name, l.nameZh ?? null, f.locale) ||
                      l.name}
                  </option>
                ))}
                <option value={OTHER_LOCATION}>{s.skiAreaOther}</option>
              </Select>
            </div>
            {lesson.location === OTHER_LOCATION && (
              <div className="min-w-0">
                <label htmlFor={`${id}-other`} className={label}>
                  {s.skiAreaOtherLabel}
                </label>
                <Input
                  id={`${id}-other`}
                  maxLength={200}
                  value={lesson.locationOther}
                  onChange={(e) => patch({ locationOther: e.target.value })}
                />
              </div>
            )}
          </div>
          <div className="mt-2">
            <div className="flex flex-wrap justify-between gap-2 text-[12.5px] font-semibold text-slate">
              <span>
                {fill(s.studentsHeading, { n: lesson.students.length })}
              </span>
              <span>
                {f.formula(lesson.durationHours, lesson.students.length)}
              </span>
            </div>
            {lesson.students.length === 0 ? (
              <p className="my-1.5 text-[13px] text-slate">{s.noStudentsYet}</p>
            ) : (
              <ul>
                {lesson.students.map((st, j) => {
                  const mine = issues.filter((x) => x.studentId === st.id);
                  const bad = mine.length > 0;
                  const m = j + 1;
                  return (
                    <li
                      key={st.id}
                      data-student-row={st.id}
                      data-testid="student"
                      className="flex min-w-0 scroll-mt-24 flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-grey/40 py-2.5"
                    >
                      <Input
                        data-field="name"
                        data-student={st.id}
                        aria-label={fill(s.studentName, { lesson: n, n: m })}
                        aria-invalid={mine.some((x) => x.field === 'name')}
                        placeholder={s.studentNamePlaceholder}
                        autoComplete="off"
                        maxLength={200}
                        value={st.name}
                        onChange={(e) =>
                          patchStudent(st.id, { name: e.target.value })
                        }
                        className="min-w-0 flex-[1_1_11rem]"
                      />
                      <label
                        className={cn(
                          'inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-md pl-2 pr-3 text-sm',
                          mine.some((x) => x.field === 'waiver')
                            ? 'bg-red-tint font-semibold text-red'
                            : 'bg-sunken',
                        )}
                      >
                        <input
                          type="checkbox"
                          data-field="waiver"
                          data-student={st.id}
                          className="h-5 w-5 accent-[var(--status-approved)]"
                          checked={st.waiverConfirmed}
                          aria-label={fill(s.waiverFor, { lesson: n, n: m })}
                          onChange={(e) =>
                            patchStudent(st.id, {
                              waiverConfirmed: e.target.checked,
                            })
                          }
                        />
                        <span aria-hidden>{s.waiverSigned}</span>
                      </label>
                      <button
                        type="button"
                        aria-label={fill(s.removeStudent, { lesson: n, n: m })}
                        title={fill(s.removeStudent, { lesson: n, n: m })}
                        onClick={() =>
                          patch({
                            students: lesson.students.filter(
                              (x) => x.id !== st.id,
                            ),
                          })
                        }
                        className="ml-auto grid h-10 w-10 flex-none place-items-center rounded-md border border-grey/60 text-xl leading-none text-slate hover:border-red hover:text-red"
                      >
                        ×
                      </button>
                      {bad && (
                        <div className="basis-full" data-testid="student-error">
                          {mine.map((x, k) => (
                            <p
                              key={k}
                              className="text-[13px] font-semibold text-red"
                            >
                              {x.message}
                            </p>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              type="button"
              variant="secondary"
              data-field="add-student"
              data-lesson={lesson.id}
              disabled={lesson.students.length >= MAX_STUDENTS}
              onClick={addStudent}
              className="mt-1 w-full border-[1.5px] border-dashed border-grey hover:border-navy"
            >
              {s.addStudent}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
