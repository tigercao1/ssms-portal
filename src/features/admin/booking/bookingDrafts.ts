import { useCallback, useSyncExternalStore } from 'react';
import type { PickedCustomer } from './BookingParts';
import type { BatchBookingRow, BookableStatus } from './types';

const VERSION = 1;
export const DRAFTS_KEY_PREFIX = `ssms.bookingDrafts.v${VERSION}:`;
export const MAX_DRAFTS = 20;

export interface DraftError {
  code: string;
  message: string;
}

export interface DraftBooking {
  id: string;
  customers: PickedCustomer[];
  lessonTypeId: string;
  lessonTypeNameEn: string;
  lessonTypeNameZh: string | null;
  durationMin: number;
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
  rows: DraftBooking[];
  outcomeUnknown?: boolean;
}

export type DraftInput = Omit<DraftBooking, 'id' | 'error'>;

export function draftsKey(userId: string) {
  return `${DRAFTS_KEY_PREFIX}${userId}`;
}

export const newId = () => crypto.randomUUID();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isNullableString = (v: unknown) => v === null || isString(v);

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

function isRow(value: unknown): value is DraftBooking {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  const error = r.error as Record<string, unknown> | undefined;
  return (
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
    isString(r.startsAt) &&
    !Number.isNaN(Date.parse(r.startsAt)) &&
    isString(r.notes) &&
    isString(r.locationId) &&
    (r.status === undefined ||
      r.status === 'scheduled' ||
      r.status === 'completed' ||
      r.status === 'no_show') &&
    (r.addToCalendar === undefined || typeof r.addToCalendar === 'boolean') &&
    (error === undefined ||
      (!!error &&
        typeof error === 'object' &&
        isString(error.code) &&
        isString(error.message)))
  );
}

function isCart(value: unknown): value is DraftCart {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    c.version === VERSION &&
    isString(c.batchId) &&
    c.batchId.length > 0 &&
    Array.isArray(c.rows) &&
    c.rows.every(isRow) &&
    (c.outcomeUnknown === undefined || typeof c.outcomeUnknown === 'boolean')
  );
}

const EMPTY: DraftBooking[] = [];
const listeners = new Set<() => void>();
let snapshot: { key: string; raw: string | null; cart: DraftCart | null } = {
  key: '',
  raw: null,
  cart: null,
};

function readCart(key: string): DraftCart | null {
  const store = storage();
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
    if (cart && cart.rows.length > 0)
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

export function toBatchRow(row: DraftBooking): BatchBookingRow {
  return {
    instructorId: row.instructorId,
    lessonTypeId: row.lessonTypeId,
    startsAt: row.startsAt,
    customerIds: row.customers.map((c) => c.id),
    ...(row.notes.trim() && { notes: row.notes.trim() }),
    ...(row.locationId && { locationId: row.locationId }),
    ...(row.status && { status: row.status }),
    ...(row.addToCalendar !== undefined && {
      addToCalendar: row.addToCalendar,
    }),
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
        rows: [],
      };
      writeCart(key, recipe(current));
    },
    [key],
  );

  const add = useCallback(
    (input: DraftInput) =>
      update((c) =>
        c.outcomeUnknown
          ? c
          : { ...c, rows: [...c.rows, { ...input, id: newId() }] },
      ),
    [update],
  );

  const replace = useCallback(
    (id: string, input: DraftInput) =>
      update((c) =>
        c.outcomeUnknown
          ? c
          : {
              ...c,
              rows: c.rows.map((r) => (r.id === id ? { ...input, id } : r)),
            },
      ),
    [update],
  );

  const remove = useCallback(
    (id: string) =>
      update((c) =>
        c.outcomeUnknown
          ? c
          : { ...c, rows: c.rows.filter((r) => r.id !== id) },
      ),
    [update],
  );

  const clear = useCallback(() => writeCart(key, null), [key]);

  return {
    rows: cart?.rows ?? EMPTY,
    batchId: cart?.batchId ?? null,
    outcomeUnknown: cart?.outcomeUnknown === true,
    update,
    add,
    replace,
    remove,
    clear,
  };
}
