import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full rounded-md border border-grey bg-surface px-3 text-ink',
        'focus:border-navy focus:outline-none',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});
