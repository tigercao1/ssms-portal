import type { MyLesson, MyLessonsResponse, MyPayPeriod } from './types';

export function fakeMyLesson(overrides: Partial<MyLesson> = {}): MyLesson {
  return {
    classId: 'c1',
    date: '2027-02-13',
    startTime: '10:00',
    endTime: '12:00',
    startsAt: '2027-02-13T15:00:00Z',
    endsAt: '2027-02-13T17:00:00Z',
    status: 'scheduled',
    lessonTypeNameEn: '1 to 1 private lesson',
    lessonTypeNameZh: '1对1',
    locationName: 'Moonstone',
    students: ['Wei Z.'],
    minutes: 120,
    rate: 90,
    rateUnit: 'hour',
    currency: 'CAD',
    amount: 180,
    needsRate: false,
    ...overrides,
  };
}

const awaiting: MyPayPeriod = {
  startsOn: '2027-01-25',
  endsOn: '2027-02-07',
  status: 'awaiting',
  finalizedAt: null,
  lessons: [
    fakeMyLesson({ classId: 'a1', date: '2027-01-30', status: 'completed' }),
    fakeMyLesson({
      classId: 'a2',
      date: '2027-01-31',
      status: 'completed',
      students: ['Amy L.'],
    }),
  ],
  adjustments: [
    {
      id: 'adj1',
      description: 'Travel to Blue Mountain',
      amount: 40,
      currency: 'CAD',
    },
  ],
  totals: [
    {
      currency: 'CAD',
      lessons: 2,
      minutes: 240,
      lessonAmount: 360,
      adjustmentAmount: 40,
      total: 400,
      needsRateCount: 0,
    },
  ],
};

const paid: MyPayPeriod = {
  startsOn: '2027-01-11',
  endsOn: '2027-01-24',
  status: 'paid',
  finalizedAt: '2027-01-26T15:00:00Z',
  lessons: [
    fakeMyLesson({ classId: 'p1', date: '2027-01-14', status: 'completed' }),
    fakeMyLesson({ classId: 'p2', date: '2027-01-16', status: 'completed' }),
    fakeMyLesson({ classId: 'p3', date: '2027-01-17', status: 'no_show' }),
  ],
  adjustments: [],
  totals: [
    {
      currency: 'CAD',
      lessons: 3,
      minutes: 360,
      lessonAmount: 540,
      adjustmentAmount: 0,
      total: 540,
      needsRateCount: 0,
    },
  ],
};

const paidDaily: MyPayPeriod = {
  startsOn: '2026-12-28',
  endsOn: '2027-01-10',
  status: 'paid',
  finalizedAt: '2027-01-12T15:00:00Z',
  lessons: [
    fakeMyLesson({
      classId: 'd1',
      date: '2027-01-02',
      startTime: '09:00',
      endTime: '13:00',
      status: 'completed',
      lessonTypeNameEn: 'Group day',
      lessonTypeNameZh: '团体全天课',
      locationName: 'Blue Mountain',
      students: ['Kai W.', 'Ava S.', 'Leo M.'],
      minutes: 240,
      rate: 400,
      rateUnit: 'day',
      amount: 400,
    }),
  ],
  adjustments: [
    { id: 'adj2', description: 'Uniform', amount: -65, currency: 'CAD' },
  ],
  totals: [
    {
      currency: 'CAD',
      lessons: 1,
      minutes: 240,
      lessonAmount: 400,
      adjustmentAmount: -65,
      total: 335,
      needsRateCount: 0,
    },
  ],
};

export const fullLessons: MyLessonsResponse = {
  locked: false,
  lockReason: null,
  upcoming: {
    lessons: [
      fakeMyLesson(),
      fakeMyLesson({
        classId: 'c2',
        date: '2027-02-14',
        startTime: '13:00',
        endTime: '15:00',
        students: ['Amy L.'],
      }),
      fakeMyLesson({
        classId: 'c3',
        date: '2027-02-20',
        startTime: '09:30',
        endTime: '11:00',
        lessonTypeNameEn: 'Group lesson',
        lessonTypeNameZh: '团体课',
        locationName: 'Blue Mountain',
        students: ['Kai W.', 'Ava S.', 'Leo M.'],
        minutes: 90,
        rate: null,
        amount: null,
        needsRate: true,
      }),
    ],
    projected: [{ currency: 'CAD', amount: 360, lessons: 2 }],
    needsRateCount: 1,
  },
  periods: [awaiting, paid, paidDaily],
};

export const emptyLessons: MyLessonsResponse = {
  locked: false,
  lockReason: null,
  upcoming: { lessons: [], projected: [], needsRateCount: 0 },
  periods: [],
};

export const pendingLessons: MyLessonsResponse = {
  ...emptyLessons,
  locked: true,
  lockReason: 'pending_approval',
};

export const rejectedLessons: MyLessonsResponse = {
  ...emptyLessons,
  locked: true,
  lockReason: 'rejected',
  periods: [awaiting, paid],
};
