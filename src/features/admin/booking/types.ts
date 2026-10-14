import type { AdminClass } from '@/lib/types';

export const WEEKDAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface DayWindow {
  start: string;
  end: string;
}

export type WeekdayOverride = DayWindow | { closed: true };

export interface BookingSettings {
  dayStartTime: string;
  dayEndTime: string;
  slotMinutes: number;
  weekdayOverrides: Partial<Record<Weekday, WeekdayOverride>>;
  updatedAt: string;
}

export type BookingSettingsInput = Omit<BookingSettings, 'updatedAt'>;

export type UnavailableReason =
  | 'inactive'
  | 'no_calendar'
  | 'calendar_not_confirmed'
  | 'calendar_not_writable'
  | 'calendar_error'
  | 'google_not_connected'
  | 'google_unavailable';

export interface BusyBlock {
  start: string;
  end: string;
  source: 'google' | 'ssms';
}

export interface InstructorAvailability {
  instructorId: string;
  displayNameEn: string;
  displayNameZh: string | null;
  googleCalendarId: string;
  busy: BusyBlock[];
  freeSlots: string[];
}

export interface UnavailableInstructor {
  instructorId: string;
  displayNameEn: string;
  displayNameZh: string | null;
  reason: UnavailableReason;
}

export interface Availability {
  date: string;
  timeZone: string;
  lessonTypeId: string;
  durationMin: number;
  slotMinutes: number;
  window: DayWindow | null;
  slots: string[];
  instructors: InstructorAvailability[];
  unavailable: UnavailableInstructor[];
}

export interface BookingConflict {
  occurrence: number;
  startsAt: string;
  endsAt: string;
  busyStart: string;
  busyEnd: string;
  source: 'ssms' | 'google';
}

export type BookableStatus = 'scheduled' | 'completed' | 'no_show';

export interface CreateBookingInput {
  instructorId: string;
  lessonTypeId: string;
  startsAt: string;
  customerIds: string[];
  locationId?: string;
  notes?: string;
  repeat?: { weekly: true; count: number };
  status?: BookableStatus;
  addToCalendar?: boolean;
}

export interface UpdateBookingInput {
  startsAt?: string;
  instructorId?: string;
  lessonTypeId?: string;
  customerIds?: string[];
  notes?: string | null;
}

export type CalendarSync = 'ok' | 'failed';

export interface BookedClass extends AdminClass {
  calendarSync: CalendarSync;
  calendarSyncError: string | null;
}

export interface EventDeletionIssue {
  id: string;
  googleCalendarId: string;
  googleEventId: string;
  classId: string | null;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
}

export interface SyncIssues {
  classes: BookedClass[];
  deletions: EventDeletionIssue[];
}

export interface LastClass {
  classId: string;
  startsAt: string;
  weekday: Weekday;
  time: string;
  lessonTypeId: string | null;
  lessonTypeNameEn: string | null;
  lessonTypeNameZh: string | null;
  instructorId: string;
  instructorName: string | null;
  instructorNameZh: string | null;
  locationId: string | null;
}
