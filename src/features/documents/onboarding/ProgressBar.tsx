/** Thin progress bar for "x of y done". */
export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="h-2 w-full overflow-hidden rounded-full bg-sunken"
    >
      <div
        className="h-full rounded-full bg-status-approved transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
