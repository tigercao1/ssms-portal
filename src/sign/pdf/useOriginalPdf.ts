import { useCallback, useEffect, useState } from 'react';
import {
  fetchOriginalPdfUrl,
  fetchPdfBytes,
  originalPdfHref,
  type SignLang,
} from '../api';
import type { PdfDocument } from './types';

type Loaded<T> =
  | { status: 'loading' }
  | { status: 'error'; key: string }
  | { status: 'ready'; key: string; value: T };

export type OriginalPdfState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; doc: PdfDocument };

export interface OriginalPdf {
  state: OriginalPdfState;
  href: string;
  open: () => void;
  retry: () => void;
}

const LOADING = { status: 'loading' } as const;

function current<T>(loaded: Loaded<T>, key: string): Loaded<T> {
  return loaded.status !== 'loading' && loaded.key === key ? loaded : LOADING;
}

export function useOriginalPdf(
  slug: string,
  lang: SignLang,
  version: number | null,
  enabled: boolean,
): OriginalPdf {
  const key = `${slug}\n${lang}\n${version}`;
  const [attempt, setAttempt] = useState(0);
  const [wanted, setWanted] = useState(false);
  const [loadedBytes, setBytes] = useState<Loaded<Uint8Array>>(LOADING);
  const [loadedDoc, setDoc] = useState<Loaded<PdfDocument>>(LOADING);
  const bytes = current(loadedBytes, key);
  const doc = current(loadedDoc, key);

  useEffect(() => {
    setBytes(LOADING);
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      try {
        const link = await fetchOriginalPdfUrl(slug, lang, signal);
        const value = await fetchPdfBytes(link.url, signal);
        if (!signal.aborted) setBytes({ status: 'ready', key, value });
      } catch {
        if (!signal.aborted) setBytes({ status: 'error', key });
      }
    })();
    return () => controller.abort();
  }, [enabled, slug, lang, key, attempt]);

  useEffect(() => {
    setDoc(LOADING);
    if (!wanted || loadedBytes.status !== 'ready') return;
    const { key: bytesKey, value: source } = loadedBytes;
    let cancelled = false;
    let destroy: (() => void) | null = null;
    import('./pdfRuntime')
      .then(({ openPdf }) => {
        if (cancelled) return null;
        const task = openPdf(source);
        destroy = task.destroy;
        return task.promise;
      })
      .then((value) => {
        if (!cancelled && value)
          setDoc({ status: 'ready', key: bytesKey, value });
      })
      .catch(() => {
        if (!cancelled) setDoc({ status: 'error', key: bytesKey });
      });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [wanted, loadedBytes]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const open = useCallback(() => {
    setWanted(true);
    if (bytes.status === 'error') retry();
  }, [bytes.status, retry]);

  const state: OriginalPdfState =
    bytes.status === 'error' || doc.status === 'error'
      ? { status: 'error' }
      : doc.status === 'ready' && bytes.status === 'ready'
        ? { status: 'ready', doc: doc.value }
        : LOADING;
  return {
    state,
    href: originalPdfHref(slug, lang),
    open,
    retry,
  };
}
