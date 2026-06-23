import logoUrl from '@/assets/logo.svg';
import { cn } from '@/lib/cn';

/** Raw logo image (red/black on transparent — best on a light surface). */
export function Logo({ className }: { className?: string }) {
  return <img src={logoUrl} alt="" aria-hidden className={cn('block', className)} />;
}

/**
 * Brandmark = the logo on a white plate, used on dark surfaces (navy sidebar /
 * auth panel) where the black parts of the mark would otherwise vanish. The
 * plate is square (matching the logo's square viewBox) with small, equal
 * padding, so spacing around the mark is identical on all four sides.
 *
 * `pad` is the fraction of the box used as padding (default 8%). On light
 * surfaces you don't need this at all — render <Logo> directly.
 */
export function Brandmark({
  size = 40,
  pad = 0.08,
  className,
}: {
  size?: number;
  pad?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md bg-white shadow-card',
        className,
      )}
      style={{ width: size, height: size, padding: Math.round(size * pad) }}
    >
      <Logo className="h-full w-full object-contain" />
    </span>
  );
}
