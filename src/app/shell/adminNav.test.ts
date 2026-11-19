import { describe, expect, it } from 'vitest';
import type { RouteObject } from 'react-router-dom';
import { router } from '@/app/router';
import { ADMIN_DASHBOARD, ADMIN_NAV_GROUPS } from './adminNav';

function routePaths(routes: RouteObject[]): string[] {
  return routes.flatMap((route) => [
    ...(route.path ? [route.path] : []),
    ...routePaths(route.children ?? []),
  ]);
}

describe('admin nav', () => {
  it('only links to pages the router serves', () => {
    const paths = routePaths(router.routes);
    const links = [
      ADMIN_DASHBOARD,
      ...ADMIN_NAV_GROUPS.flatMap((group) => group.items),
    ];
    expect(links.filter((link) => !paths.includes(link.to))).toEqual([]);
  });

  it('keeps every link in exactly one group', () => {
    const links = ADMIN_NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => item.to),
    );
    expect(new Set(links).size).toBe(links.length);
  });

  it('keeps Reports as the last group', () => {
    expect(ADMIN_NAV_GROUPS.at(-1)?.id).toBe('reports');
  });
});
