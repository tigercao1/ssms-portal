import type { ReactNode } from 'react';
import { Contour } from './Contour';

/** Empty/zero state with the alpine contour motif (PORTAL_UI_PLAN.md). */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-grey/60 bg-navy px-8 py-14 text-center text-white">
      <Contour className="pointer-events-none absolute inset-0 h-full w-full text-white" />
      <div className="relative mx-auto flex max-w-sm flex-col items-center gap-3">
        <h3 className="text-2xl text-white">{title}</h3>
        {children && <p className="text-sm text-white/70">{children}</p>}
        {action}
      </div>
    </div>
  );
}
