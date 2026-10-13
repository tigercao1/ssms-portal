export type PillTone = 'done' | 'warn' | 'bad' | 'info' | 'muted';

const TONE_COLOR: Record<PillTone, string> = {
  done: 'var(--status-approved)',
  warn: 'var(--status-pending)',
  bad: 'var(--status-rejected)',
  info: 'var(--navy)',
  muted: 'var(--status-inactive)',
};

/** Status chip in the same style as the profile approval pill. */
export function StatePill({ tone, label }: { tone: PillTone; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border-l-[3px] bg-sunken px-2 py-0.5 text-xs font-medium text-ink"
      style={{ borderColor: TONE_COLOR[tone] }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: TONE_COLOR[tone] }}
        aria-hidden
      />
      {label}
    </span>
  );
}
