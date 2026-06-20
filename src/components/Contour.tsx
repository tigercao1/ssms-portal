/**
 * Topographic contour motif (PORTAL_UI_PLAN.md signature detail). Decorative
 * SVG of nested alpine elevation lines — used on navy surfaces (login panel,
 * sidebar, empty states). `aria-hidden`; respects reduced-motion (no animation).
 */
export function Contour({
  className,
  opacity = 0.14,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 400"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ opacity }}
    >
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const inset = i * 26;
        return (
          <path
            key={i}
            d={`M${20 + inset} ${330 - inset}
                C ${120 - inset} ${250 - inset}, ${160} ${120 + inset / 2}, ${260 - inset} ${110 + inset}
                S ${380 - inset} ${60 + inset}, ${390 - inset} ${40 + inset}`}
            stroke="currentColor"
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
