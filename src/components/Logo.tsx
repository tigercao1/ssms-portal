import logoUrl from '@/assets/logo.svg';
import { cn } from '@/lib/cn';

/** Raw logo image (red/black on transparent — best on a light surface). */
export function Logo({ className }: { className?: string }) {
  return <img src={logoUrl} alt="" aria-hidden className={cn('block', className)} />;
}

/**
 * Brandmark for dark surfaces: the logo inside a white rounded chip so both the
 * red and black marks stay legible on navy (sidebar, auth panel).
 */
export function Brandmark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-md bg-white p-1.5 shadow-card"
      style={{ width: size, height: size }}
    >
      <Logo className="h-full w-full object-contain" />
    </span>
  );
}
