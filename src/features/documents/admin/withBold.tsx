import type { ReactNode } from 'react';

export function withBold(template: string, value: string): ReactNode {
  const [before, after] = template.split('{count}');
  return (
    <>
      {before}
      <b className="text-navy">{value}</b>
      {after}
    </>
  );
}
