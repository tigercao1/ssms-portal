import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-md border border-grey bg-surface px-3 text-ink',
          'placeholder:text-grey focus:border-navy focus:outline-none',
          'aria-[invalid=true]:border-status-rejected',
          className,
        )}
        {...rest}
      />
    );
  },
);
