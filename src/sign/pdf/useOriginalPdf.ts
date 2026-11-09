import { useCallback, useEffect, useState } from 'react';
import {
  fetchOriginalPdfUrl,
  fetchPdfBytes,
  originalPdfHref,
  type SignLang,
  type SignOriginalPdfUrl,
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
  const [signed, setSigned] = useState<SignOriginalPdfUrl | null>(null);
  const [bytes, setBytes] = useState<Loaded<Uint8Array>>(LOADING);
  const [doc, setDoc] = useState<Loaded<PdfDocument>>(LOADING);

  useEffect(() => {
    setSigned(null);
    setBytes(LOADING);
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      try {
        const link = await fetchOriginalPdfUrl(slug, lang, signal);
        if (signal.aborted) return;
        setSigned(link);
        const value = await fetchPdfBytes(link.url, signal);
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

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const open = useCallback(() => {
    setWanted(true);
    if (bytes.status === 'error') retry();
  }, [bytes.status, retry]);

  const state: OriginalPdfState =
    bytes.status === 'error' || doc.status === 'error'
      ? { status: 'error' }
      : doc.status === 'ready'
        ? { status: 'ready', doc: doc.value }
        : LOADING;
  const fresh = signed && Date.parse(signed.expiresAt) > Date.now();
  return {
    state,
    href: fresh ? signed.url : originalPdfHref(slug, lang),
    open,
    retry,
  };
}
