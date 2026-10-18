import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/messages/en';
import { zhCN } from '@/i18n/messages/zh-CN';
import {
  draftBody,
  duplicateLesson,
  newDraft,
  newLesson,
  validateDraft,
  type DraftLesson,
} from './draft';
import { SEASONS } from './fixtures';

function lesson(overrides: Partial<DraftLesson> = {}): DraftLesson {
  return {
    ...newLesson(),
    lessonDate: '2026-12-26',
    students: [{ id: 's1', name: 'Anna', waiverConfirmed: true }],
    ...overrides,
  };
}

describe('validateDraft', () => {
  it('passes a complete lesson', () => {
    expect(validateDraft({ lessons: [lesson()] }, SEASONS, en)).toEqual([]);
  });

  it('names the lesson and student for each problem, in Chinese too', () => {
    const lessons = [
      lesson(),
      lesson({
        lessonDate: '',
        students: [
          { id: 'a', name: ' Leo ', waiverConfirmed: false },
          { id: 'b', name: '', waiverConfirmed: false },
        ],
      }),
      lesson({ lessonDate: '2026-10-01', students: [] }),
    ];
    expect(
      validateDraft({ lessons }, SEASONS, zhCN).map((i) => i.message),
    ).toEqual([
      '第 2 节：未填日期',
      '第 2 节：学员 Leo 未确认 waiver',
      '第 2 节：第 2 名学员未填姓名',
      '第 2 节：第 2 名学员未确认 waiver',
      '第 3 节：没有保险季包含这一天',
      '第 3 节：至少添加 1 名学员',
    ]);
    const issues = validateDraft({ lessons }, SEASONS, en);
    expect(issues[1]).toEqual(
      expect.objectContaining({
        lessonId: lessons[1]!.id,
        studentId: 'a',
        field: 'waiver',
        message: "Lesson 2: Leo hasn't confirmed the waiver",
      }),
    );
  });

  it('allows a past or a future season when every lesson shares it', () => {
    for (const dates of [
      ['2026-01-10', '2026-02-01'],
      ['2027-12-26', '2028-01-02'],
    ])
      expect(
        validateDraft(
          { lessons: dates.map((lessonDate) => lesson({ lessonDate })) },
          SEASONS,
          en,
        ),
      ).toEqual([]);
  });

  it('flags a lesson in another season than the first, on that lesson', () => {
    const lessons = [
      lesson({ lessonDate: '' }),
      lesson({ lessonDate: '2026-12-26' }),
      lesson({ lessonDate: '2027-12-26' }),
    ];
    const issues = validateDraft({ lessons }, SEASONS, zhCN);
    expect(issues.slice(1)).toEqual([
      {
        lessonId: lessons[2]!.id,
        field: 'date',
        message: '第 3 节：同一份投保里的课程需在同一雪季（2026/27）',
        live: true,
      },
    ]);
    expect(validateDraft({ lessons }, SEASONS, en)[1]!.message).toBe(
      'Lesson 3: all the lessons in one request must be in the same season (2026/27)',
    );
  });

  it('flags a date in no season', () => {
    expect(
      validateDraft(
        { lessons: [lesson({ lessonDate: '2030-07-01' })] },
        SEASONS,
        en,
      ),
    ).toEqual([
      expect.objectContaining({
        field: 'date',
        message: 'Lesson 1: no insurance season covers this date',
        live: true,
      }),
    ]);
  });
});

describe('duplicateLesson', () => {
  it('copies the students with new ids and moves the date a day later', () => {
    const original = lesson({ lessonDate: '2026-12-31', collapsed: true });
    const copy = duplicateLesson(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.lessonDate).toBe('2027-01-01');
    expect(copy.collapsed).toBe(false);
    expect(copy.students.map((s) => s.name)).toEqual(['Anna']);
    expect(copy.students[0]!.id).not.toBe('s1');
    expect(duplicateLesson(lesson({ lessonDate: '' })).lessonDate).toBe('');
  });
});

describe('draftBody', () => {
  it('sends the location id or the other name and trims names', () => {
    const draft = {
      ...newDraft(),
      lessons: [
        lesson({
          location: 'l1',
          students: [{ id: 'a', name: ' Anna ', waiverConfirmed: true }],
        }),
        lesson({ location: 'other', locationOther: ' Glen Eden ' }),
        lesson({ location: 'other', locationOther: ' ' }),
      ],
    };
    const body = draftBody(draft);
    expect(body.idempotencyKey).toBe(draft.idempotencyKey);
    expect(body.lessons[0]).toEqual({
      lessonDate: '2026-12-26',
      durationHours: 1,
      locationId: 'l1',
      students: [{ name: 'Anna', waiverConfirmed: true }],
    });
    expect(body.lessons[1]!.locationOther).toBe('Glen Eden');
    expect(body.lessons[2]).not.toHaveProperty('locationOther');
    expect(body.lessons[2]).not.toHaveProperty('locationId');
  });
});
