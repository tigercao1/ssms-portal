import { useEffect, useState } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { Button } from '@/components';
import { cn } from '@/lib/cn';
import type { PublicPage } from '@/lib/types';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Draft / Published / Published · unpublished changes chip for a public page. */
export function PageStatusPill({ page }: { page: PublicPage }) {
  const t = useT();
  const tone =
    page.status === 'draft'
      ? { label: t.pages.statusDraft, border: 'border-grey', dot: 'bg-grey' }
      : page.hasUnpublishedChanges
        ? {
            label: t.pages.statusChanged,
            border: 'border-status-pending',
            dot: 'bg-status-pending',
          }
        : {
            label: t.pages.statusPublished,
            border: 'border-status-approved',
            dot: 'bg-status-approved',
          };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border-l-[3px] bg-sunken px-2 py-0.5 text-xs font-medium text-ink',
        tone.border,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden />
      {tone.label}
    </span>
  );
}

/** Copies a public page URL to the clipboard and briefly confirms. */
export function CopyLinkButton({
  url,
  ariaLabel,
}: {
  url: string;
  ariaLabel?: string;
}) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <Button size="sm" variant="ghost" aria-label={ariaLabel} onClick={copy}>
      <span aria-live="polite">
        {state === 'copied'
          ? t.pages.copied
          : state === 'failed'
            ? t.pages.copyFailed
            : t.pages.copyLink}
      </span>
    </Button>
  );
}
