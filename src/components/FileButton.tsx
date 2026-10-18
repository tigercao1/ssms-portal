import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  buttonClasses,
  ButtonSpinner,
  type ButtonSize,
  type ButtonVariant,
} from './Button';

interface FileButtonProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'className' | 'children' | 'size'
  > {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
  children: ReactNode;
}

export const FileButton = forwardRef<HTMLInputElement, FileButtonProps>(
  function FileButton(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <label
        className={buttonClasses({
          variant,
          size,
          className: cn(
            'relative cursor-pointer',
            'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
            'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-navy',
            className,
          ),
        })}
      >
        {loading && <ButtonSpinner />}
        {children}
        <input
          ref={ref}
          type="file"
          className="sr-only"
          disabled={disabled || loading}
          aria-busy={loading}
          {...rest}
        />
      </label>
    );
  },
);
