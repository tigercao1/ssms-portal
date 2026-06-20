import type { ReactNode } from 'react';
import { useId } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

/**
 * Label + hint + error wrapper (W1.6). Wires `aria-describedby` and
 * `aria-invalid` to the control via a render prop, so a11y (W3.3) is built in.
 */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-navy">
        {label}
        {required && <span className="ml-0.5 text-red">*</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-err`} className="text-sm text-status-rejected">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-slate">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
