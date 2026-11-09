import { useCallback, useSyncExternalStore } from 'react';
import type { PickedCustomer } from './BookingParts';
import { schoolParts } from './bookingRules';
import type {
  BatchBookingRow,
  BookableStatus,
  CreateBookingInput,
} from './types';

const VERSION = 2;
const LEGACY_VERSION = 1;
export const DRAFTS_KEY_PREFIX = `ssms.bookingDrafts.v${VERSION}:`;
const LEGACY_KEY_PREFIX = `ssms.bookingDrafts.v${LEGACY_VERSION}:`;
export const MAX_DRAFTS = 20;

export type CardMode = 'grid' | 'past';

export interface DraftError {
  code: string;
  message: string;
}

export interface DraftCard {
  id: string;
  mode: CardMode;
  customers: PickedCustomer[];
  lessonTypeId: string;
  lessonTypeNameEn: string;
  lessonTypeNameZh: string | null;
  durationMin: number;
  date: string;
  time: string;
  instructorId: string;
  instructorNameEn: string;
  instructorNameZh: string | null;
  startsAt: string;
  notes: string;
  locationId: string;
  status?: BookableStatus;
  addToCalendar?: boolean;
  error?: DraftError;
}

export interface DraftCart {
  version: typeof VERSION;
  batchId: string;
  cards: DraftCard[];
  outcomeUnknown?: boolean;
}

export type CardGap =
  | 'customer'
  | 'lessonType'
  | 'instructor'
  | 'startTime'
  | 'pastTime';

export function draftsKey(userId: string) {
  return `${DRAFTS_KEY_PREFIX}${userId}`;
}

export const newId = () => crypto.randomUUID();

export function blankCard(date: string, from?: DraftCard): DraftCard {
  return {
    id: newId(),
    mode: from?.mode ?? 'grid',
    customers: from?.customers ?? [],
    lessonTypeId: from?.lessonTypeId ?? '',
    lessonTypeNameEn: from?.lessonTypeNameEn ?? '',
    lessonTypeNameZh: from?.lessonTypeNameZh ?? null,
    durationMin: from?.durationMin ?? 0,
    date: from?.date ?? date,
    time: '',
    instructorId: '',
    instructorNameEn: '',
    instructorNameZh: null,
    startsAt: '',
    notes: '',
    locationId: '',
    ...(from?.mode === 'past' && { status: 'completed', addToCalendar: false }),
  };
}

export function cardGaps(card: DraftCard, now: number): CardGap[] {
  const gaps: CardGap[] = [];
  if (card.customers.length === 0) gaps.push('customer');
  if (!card.lessonTypeId) gaps.push('lessonType');
  if (!card.instructorId) gaps.push('instructor');
  if (!card.startsAt) gaps.push('startTime');
  else if (card.mode === 'past' && Date.parse(card.startsAt) >= now)
    gaps.push('pastTime');
  return gaps;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isNullableString = (v: unknown) => v === null || isString(v);
const isInstant = (v: unknown) => isString(v) && !Number.isNaN(Date.parse(v));
const isStatus = (v: unknown) =>
  v === undefined || v === 'scheduled' || v === 'completed' || v === 'no_show';
const isOptionalBoolean = (v: unknown) =>
  v === undefined || typeof v === 'boolean';

function isCustomer(value: unknown): value is PickedCustomer {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    isString(c.id) &&
    isNullableString(c.firstName) &&
    isNullableString(c.lastName) &&
    isNullableString(c.email) &&
    isNullableString(c.phone)
  );
}

function isError(value: unknown) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return isString(e.code) && isString(e.message);
}

function isCard(value: unknown): value is DraftCard {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    isString(r.id) &&
    (r.mode === 'grid' || r.mode === 'past') &&
    Array.isArray(r.customers) &&
    r.customers.every(isCustomer) &&
    isString(r.lessonTypeId) &&
    isString(r.lessonTypeNameEn) &&
    isNullableString(r.lessonTypeNameZh) &&
    typeof r.durationMin === 'number' &&
    isString(r.date) &&
    isString(r.time) &&
    isString(r.instructorId) &&
    isString(r.instructorNameEn) &&
    isNullableString(r.instructorNameZh) &&
    (r.startsAt === '' || isInstant(r.startsAt)) &&
    isString(r.notes) &&
    isString(r.locationId) &&
    isStatus(r.status) &&
    isOptionalBoolean(r.addToCalendar) &&
    isError(r.error)
  );
}

function isCart(value: unknown): value is DraftCart {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    c.version === VERSION &&
    isString(c.batchId) &&
    c.batchId.length > 0 &&
    Array.isArray(c.cards) &&
    c.cards.every(isCard) &&
    isOptionalBoolean(c.outcomeUnknown)
  );
}

function legacyCard(value: unknown): DraftCard | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const valid =
    isString(r.id) &&
    Array.isArray(r.customers) &&
    r.customers.length > 0 &&
    r.customers.every(isCustomer) &&
    isString(r.lessonTypeId) &&
    isString(r.lessonTypeNameEn) &&
    isNullableString(r.lessonTypeNameZh) &&
    typeof r.durationMin === 'number' &&
    isString(r.instructorId) &&
    isString(r.instructorNameEn) &&
    isNullableString(r.instructorNameZh) &&
    isInstant(r.startsAt) &&
    isString(r.notes) &&
    isString(r.locationId) &&
    isStatus(r.status) &&
    isOptionalBoolean(r.addToCalendar) &&
    isError(r.error);
  if (!valid) return null;
  const row = r as unknown as Omit<DraftCard, 'mode' | 'date' | 'time'>;
  const parts = schoolParts(row.startsAt);
  return {
    ...row,
    mode: row.status ? 'past' : 'grid',
    date: parts.date,
    time: row.status ? parts.time : '',
  };
}

function migrateLegacy(store: Storage, key: string) {
  const legacyKey = key.replace(DRAFTS_KEY_PREFIX, LEGACY_KEY_PREFIX);
  const raw = store.getItem(legacyKey);
  if (!raw) return;
  store.removeItem(legacyKey);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      parsed.version !== LEGACY_VERSION ||
      !isString(parsed.batchId) ||
      !parsed.batchId ||
      !Array.isArray(parsed.rows) ||
      !isOptionalBoolean(parsed.outcomeUnknown)
    )
      return;
    const cards = parsed.rows.map(legacyCard);
    if (cards.length === 0 || cards.some((c) => c === null)) return;
    const cart: DraftCart = {
      version: VERSION,
      batchId: parsed.batchId,
      cards: cards as DraftCard[],
      ...(parsed.outcomeUnknown !== undefined && {
        outcomeUnknown: parsed.outcomeUnknown as boolean,
      }),
    };
    store.setItem(key, JSON.stringify(cart));
  } catch {
    return;
  }
}

const EMPTY: DraftCard[] = [];
const listeners = new Set<() => void>();
let snapshot: { key: string; raw: string | null; cart: DraftCart | null } = {
  key: '',
  raw: null,
  cart: null,
};

function readCart(key: string): DraftCart | null {
  const store = storage();
  if (store && store.getItem(key) === null) migrateLegacy(store, key);
  const raw = store?.getItem(key) ?? null;
  if (snapshot.key === key && snapshot.raw === raw) return snapshot.cart;
  let cart: DraftCart | null = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      cart = isCart(parsed) ? parsed : null;
    } catch {
      cart = null;
    }
    if (!cart) store?.removeItem(key);
  }
  snapshot = { key, raw: cart ? raw : null, cart };
  return cart;
}

function writeCart(key: string, cart: DraftCart | null) {
  try {
    if (cart && cart.cards.length > 0)
      storage()?.setItem(key, JSON.stringify(cart));
    else storage()?.removeItem(key);
  } catch {
    snapshot = { key, raw: snapshot.raw, cart };
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(DRAFTS_KEY_PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function toBatchRow(card: DraftCard): BatchBookingRow {
  return {
    instructorId: card.instructorId,
    lessonTypeId: card.lessonTypeId,
    startsAt: card.startsAt,
    customerIds: card.customers.map((c) => c.id),
    ...(card.notes.trim() && { notes: card.notes.trim() }),
    ...(card.locationId && { locationId: card.locationId }),
    ...(card.status && { status: card.status }),
    ...(card.addToCalendar !== undefined && {
      addToCalendar: card.addToCalendar,
    }),
  };
}

export function toCreateInput(
  card: DraftCard,
  repeat: number,
): CreateBookingInput {
  return {
    ...toBatchRow(card),
    ...(card.mode === 'grid' &&
      repeat > 1 && { repeat: { weekly: true as const, count: repeat } }),
  };
}

export function useBookingDrafts(userId: string) {
  const key = draftsKey(userId);
  const cart = useSyncExternalStore(subscribe, () => readCart(key));

  const update = useCallback(
    (recipe: (cart: DraftCart) => DraftCart) => {
      const current = readCart(key) ?? {
        version: VERSION,
        batchId: newId(),
        cards: [],
      };
      writeCart(key, recipe(current));
    },
    [key],
  );

  const edit = useCallback(
    (recipe: (cards: DraftCard[]) => DraftCard[]) =>
      update((c) => (c.outcomeUnknown ? c : { ...c, cards: recipe(c.cards) })),
    [update],
  );

  const clear = useCallback(() => writeCart(key, null), [key]);

  return {
    cards: cart?.cards ?? EMPTY,
    batchId: cart?.batchId ?? null,
    outcomeUnknown: cart?.outcomeUnknown === true,
    update,
    edit,
    clear,
  };
}
