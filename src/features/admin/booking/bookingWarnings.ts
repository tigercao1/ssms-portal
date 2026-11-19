import { useSyncExternalStore } from 'react';

export type BookingWarningsNotice = {
  kind: 'cancelled' | 'moved';
  lines: string[];
};

let notice: BookingWarningsNotice | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function showBookingWarnings(next: BookingWarningsNotice) {
  notice = next;
  emit();
}

export function hideBookingWarnings() {
  if (notice === null) return;
  notice = null;
  emit();
}

export function useBookingWarnings() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => notice,
  );
}
