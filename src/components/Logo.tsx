import logoUrl from '@/assets/logo.svg';
import { cn } from '@/lib/cn';

/**
 * Raw logo image (red/black on a transparent background). The SVG viewBox is
 * cropped to the wordmark, so it carries no internal whitespace — size it with
 * a height class/style and let width follow the aspect ratio.
 */
export function Logo({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden
      className={cn('block w-auto', className)}
      style={style}
    />
  );
}

/**
 * Brandmark = the logo on a white plate, for dark surfaces (navy sidebar / auth
 * panel) where the black parts would vanish. Rectangular, hugging the wordmark
 * with small equal padding on all four sides.
 */
export function Brandmark({
  height = 28,
  pad = 10,
  className,
}: {
  height?: number;
  pad?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md bg-white shadow-card',
        className,
      )}
      style={{ padding: pad }}
    >
      <Logo style={{ height }} />
    </span>
  );
}
