import logoUrl from '@/assets/logo.svg';
import { cn } from '@/lib/cn';

/** Raw logo image (red/black on transparent — best on a light surface). */
export function Logo({ className }: { className?: string }) {
  return <img src={logoUrl} alt="" aria-hidden className={cn('block', className)} />;
}

/**
 * Brandmark = the logo on a white rounded plate, so the red + black marks stay
 * legible on dark surfaces (navy sidebar / auth panel). Padding scales with
 * size so it reads as a deliberate badge at any scale.
 */
export function Brandmark({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center bg-white shadow-card',
        size >= 96 ? 'rounded-2xl' : 'rounded-lg',
        className,
      )}
      style={{ width: size, height: size, padding: Math.round(size * 0.16) }}
    >
      <Logo className="h-full w-full object-contain" />
    </span>
  );
}
