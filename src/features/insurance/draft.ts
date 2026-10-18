import { useCallback, useSyncExternalStore } from 'react';
import type { Messages } from '@/i18n/core/types';
import { shiftDate } from '@/features/admin/payroll/payrollFormat';
import { fill } from './money';
import type { InsuranceSeason, SubmitRequestBody } from './types';

export const DRAFT_KEY_PREFIX = 'ssms.insuranceDraft.v1:';
export const MAX_LESSONS = 10;
export const MAX_STUDENTS = 50;
export const OTHER_LOCATION = 'other';

export interface DraftStudent {
  id: string;
  name: string;
  waiverConfirmed: boolean;
}

export interface DraftLesson {
  id: string;
  lessonDate: string;
  durationHours: 1 | 2;
  location: string;
  locationOther: string;
  students: DraftStudent[];
  collapsed: boolean;
}

export interface InsuranceDraft {
  lessons: DraftLesson[];
  idempotencyKey: string;
  savedAt: number;
  showErrors: boolean;
}

export type IssueField = 'date' | 'students' | 'name' | 'waiver';

export interface DraftIssue {
  lessonId: string;
  studentId?: string;
  field: IssueField;
  message: string;
  live?: boolean;
}

const newId = () => crypto.randomUUID();

export function newDraft(): InsuranceDraft {
  return {
    lessons: [],
    idempotencyKey: newId(),
    savedAt: Date.now(),
    showErrors: false,
  };
}

export function newLesson(): DraftLesson {
  return {
    id: newId(),
    lessonDate: '',
    durationHours: 1,
    location: '',
    locationOther: '',
    students: [],
    collapsed: false,
  };
}

export function newStudent(): DraftStudent {
  return { id: newId(), name: '', waiverConfirmed: false };
}

export function duplicateLesson(lesson: DraftLesson): DraftLesson {
  return {
    ...lesson,
    id: newId(),
    lessonDate: lesson.lessonDate ? shiftDate(lesson.lessonDate, 1) : '',
    collapsed: false,
    students: lesson.students.map((s) => ({ ...s, id: newId() })),
  };
}

export function inSeason(date: string, season: InsuranceSeason) {
  return date >= season.startsOn && date <= season.endsOn;
}

export function seasonOfDate<S extends InsuranceSeason>(
  date: string,
  seasons: readonly S[],
): S | null {
  return date ? (seasons.find((x) => inSeason(date, x)) ?? null) : null;
}

export function requestSeason<S extends InsuranceSeason>(
  lessons: readonly Pick<DraftLesson, 'lessonDate'>[],
  seasons: readonly S[],
): S | null {
  for (const lesson of lessons) {
    const season = seasonOfDate(lesson.lessonDate, seasons);
    if (season) return season;
  }
  return null;
}

export function validateDraft(
  draft: Pick<InsuranceDraft, 'lessons'>,
  seasons: readonly InsuranceSeason[],
  t: Messages,
): DraftIssue[] {
  const s = t.insurance;
  const issues: DraftIssue[] = [];
  const season = requestSeason(draft.lessons, seasons);
  draft.lessons.forEach((lesson, i) => {
    const n = i + 1;
    const lessonSeason = seasonOfDate(lesson.lessonDate, seasons);
    if (!lesson.lessonDate)
      issues.push({
        lessonId: lesson.id,
        field: 'date',
        message: fill(s.errDate, { n }),
      });
    else if (!lessonSeason)
      issues.push({
        lessonId: lesson.id,
        field: 'date',
        message: fill(s.errNoSeason, { n }),
        live: true,
      });
    else if (season && lessonSeason.key !== season.key)
      issues.push({
        lessonId: lesson.id,
        field: 'date',
        message: fill(s.errOtherSeason, { n, key: season.key }),
        live: true,
      });
    if (lesson.students.length === 0)
      issues.push({
        lessonId: lesson.id,
        field: 'students',
        message: fill(s.errStudents, { n }),
      });
    lesson.students.forEach((student, j) => {
      const name = student.name.trim();
      if (!name)
        issues.push({
          lessonId: lesson.id,
          studentId: student.id,
          field: 'name',
          message: fill(s.errName, { n, m: j + 1 }),
        });
      if (!student.waiverConfirmed)
        issues.push({
          lessonId: lesson.id,
          studentId: student.id,
          field: 'waiver',
          message: name
            ? fill(s.errWaiver, { n, name })
            : fill(s.errWaiverNoName, { n, m: j + 1 }),
        });
    });
  });
  return issues;
}

export function draftBody(draft: InsuranceDraft): SubmitRequestBody {
  return {
    idempotencyKey: draft.idempotencyKey,
    lessons: draft.lessons.map((l) => ({
      lessonDate: l.lessonDate,
      durationHours: l.durationHours,
      ...(l.location &&
        l.location !== OTHER_LOCATION && { locationId: l.location }),
      ...(l.location === OTHER_LOCATION &&
        l.locationOther.trim() && { locationOther: l.locationOther.trim() }),
      students: l.students.map((s) => ({
        name: s.name.trim(),
        waiverConfirmed: s.waiverConfirmed,
      })),
    })),
  };
}

export function draftKey(userId: string) {
  return `${DRAFT_KEY_PREFIX}${userId}`;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isDraft(value: unknown): value is InsuranceDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<InsuranceDraft>;
  return (
    Array.isArray(d.lessons) &&
    typeof d.idempotencyKey === 'string' &&
    d.lessons.every(
      (l) =>
        l &&
        typeof l.id === 'string' &&
        typeof l.lessonDate === 'string' &&
        Array.isArray(l.students),
    )
  );
}

const listeners = new Set<() => void>();
let snapshot: {
  key: string;
  raw: string | null;
  draft: InsuranceDraft | null;
} = { key: '', raw: null, draft: null };

function readDraft(key: string): InsuranceDraft | null {
  const raw = storage()?.getItem(key) ?? null;
  if (snapshot.key === key && snapshot.raw === raw) return snapshot.draft;
  let draft: InsuranceDraft | null = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      draft = isDraft(parsed) ? parsed : null;
    } catch {
      draft = null;
    }
  }
  snapshot = { key, raw, draft };
  return draft;
}

function writeDraft(key: string, draft: InsuranceDraft | null) {
  try {
    if (draft) storage()?.setItem(key, JSON.stringify(draft));
    else storage()?.removeItem(key);
  } catch {
    snapshot = { key, raw: snapshot.raw, draft };
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(DRAFT_KEY_PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useInsuranceDraft(userId: string) {
  const key = draftKey(userId);
  const draft = useSyncExternalStore(subscribe, () => readDraft(key));

  const update = useCallback(
    (recipe: (draft: InsuranceDraft) => InsuranceDraft) => {
      const next = recipe(readDraft(key) ?? newDraft());
      writeDraft(key, { ...next, savedAt: Date.now() });
    },
    [key],
  );
  const discard = useCallback(() => writeDraft(key, null), [key]);

  return { draft, update, discard };
}
