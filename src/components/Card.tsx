import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-grey/60 bg-surface p-6 shadow-card',
        className,
      )}
    >
      {children}
    </div>
  );
}
