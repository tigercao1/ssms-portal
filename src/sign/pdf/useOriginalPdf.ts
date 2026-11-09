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
  | { status: 'error' }
  | { status: 'ready'; value: T };

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

export function useOriginalPdf(
  slug: string,
  lang: SignLang,
  enabled: boolean,
): OriginalPdf {
  const [attempt, setAttempt] = useState(0);
  const [wanted, setWanted] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Loaded<Uint8Array>>(LOADING);
  const [doc, setDoc] = useState<Loaded<PdfDocument>>(LOADING);

  useEffect(() => {
    setUrl(null);
    setBytes(LOADING);
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      try {
        const signed = await fetchOriginalPdfUrl(slug, lang, signal);
        if (signal.aborted) return;
        setUrl(signed.url);
        const value = await fetchPdfBytes(signed.url, signal);
        if (!signal.aborted) setBytes({ status: 'ready', value });
      } catch {
        if (!signal.aborted) setBytes({ status: 'error' });
      }
    })();
    return () => controller.abort();
  }, [enabled, slug, lang, attempt]);

  useEffect(() => {
    setDoc(LOADING);
    if (!wanted || bytes.status !== 'ready') return;
    let cancelled = false;
    let destroy: (() => void) | null = null;
    import('./pdfRuntime')
      .then(({ openPdf }) => {
        if (cancelled) return null;
        const task = openPdf(bytes.value);
        destroy = task.destroy;
        return task.promise;
      })
      .then((value) => {
        if (!cancelled && value) setDoc({ status: 'ready', value });
      })
      .catch(() => {
        if (!cancelled) setDoc({ status: 'error' });
      });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [wanted, bytes]);

  const open = useCallback(() => setWanted(true), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const state: OriginalPdfState =
    bytes.status === 'error' || doc.status === 'error'
      ? { status: 'error' }
      : doc.status === 'ready'
        ? { status: 'ready', doc: doc.value }
        : LOADING;
  return { state, href: url ?? originalPdfHref(slug, lang), open, retry };
}
