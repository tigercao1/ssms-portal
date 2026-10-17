import type { StatusMeta } from './statusMeta';

export function DotPill({ color, textClass, label }: StatusMeta) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border-l-[3px] bg-sunken px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span className={textClass}>{label}</span>
    </span>
  );
}
