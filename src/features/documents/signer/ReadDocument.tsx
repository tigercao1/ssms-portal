import { useEffect, useRef, useState } from 'react';
import { Banner, Button } from '@/components';
import { PdfPages } from '../pdf/PdfPages';
import type { SourceRecovery } from '../pdf/presignedSource';

export interface ReadDocumentText {
  ack: string;
  submit: string;
  scrollHint: string;
}

interface ReadDocumentProps {
  sourceUrl: string;
  text: ReadDocumentText;
  submitting?: boolean;
  submitError?: string | null;
  onSubmit: (body: { acknowledged: true }) => void;
  sourceRecovery?: SourceRecovery;
}

/** Read-only document: scroll to the end, tick "I have read and understood", done. */
export function ReadDocument({
  sourceUrl,
  text,
  submitting,
  submitError,
  onSubmit,
  sourceRecovery,
}: ReadDocumentProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    const el = endRef.current;
    if (!el || !loaded) return;
    if (typeof IntersectionObserver === 'undefined') {
      setReachedEnd(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setReachedEnd(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loaded]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-sunken p-2 sm:p-4">
        <PdfPages
          source={sourceUrl}
          onLoad={() => {
            setLoaded(true);
            sourceRecovery?.onLoad();
          }}
          onError={sourceRecovery?.onError}
        />
        <div ref={endRef} data-testid="read-end" className="h-px" />
      </div>
      <div className="sticky bottom-0 flex flex-col gap-3 rounded-lg border border-grey/60 bg-surface p-4 shadow-card">
        {!reachedEnd && <p className="text-sm text-slate">{text.scrollHint}</p>}
        <label className="flex items-start gap-3 text-sm font-medium text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--navy)]"
            checked={acknowledged}
            disabled={!reachedEnd}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          {text.ack}
        </label>
        {submitError && <Banner tone="error">{submitError}</Banner>}
        <Button
          className="self-start"
          disabled={!acknowledged || !reachedEnd}
          loading={submitting}
          onClick={() => onSubmit({ acknowledged: true })}
        >
          {text.submit}
        </Button>
      </div>
    </div>
  );
}
