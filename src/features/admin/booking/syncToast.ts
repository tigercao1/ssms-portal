import { useSyncExternalStore } from 'react';
import type { BookedClass } from './types';

export const SYNC_TOAST_MS = 8000;

let visible = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function hideSyncToast() {
  clearTimeout(timer);
  timer = undefined;
  if (!visible) return;
  visible = false;
  emit();
}

export function showSyncToast() {
  clearTimeout(timer);
  timer = setTimeout(hideSyncToast, SYNC_TOAST_MS);
  visible = true;
  emit();
}

export function warnIfSyncFailed(saved: BookedClass | BookedClass[]) {
  const list = Array.isArray(saved) ? saved : [saved];
  if (list.some((c) => c.calendarSync === 'failed')) showSyncToast();
}

export function useSyncToastVisible() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => visible,
  );
}
