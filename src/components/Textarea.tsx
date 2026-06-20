import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-md border border-grey bg-surface px-3 py-2 text-ink',
        'placeholder:text-grey focus:border-navy focus:outline-none',
        'aria-[invalid=true]:border-status-rejected',
        className,
      )}
      {...rest}
    />
  );
});
