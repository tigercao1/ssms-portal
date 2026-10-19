import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { AdminDashboard } from './AdminDashboard';
import { filtersFrom } from './InstructorFilters';
import { renderWithProviders } from '@/test/render';
import { fakeAdminList, server } from '@/test/msw';
import type { AdminInstructorRecord, InstructorStage } from '@/lib/types';

const API = 'http://localhost:3000';

const jane = fakeAdminList[0] as AdminInstructorRecord;

function instructor(
  id: string,
  name: string,
  overrides: Partial<AdminInstructorRecord>,
): AdminInstructorRecord {
  return {
    ...jane,
    id,
    authUserId: `auth-${id}`,
    email: `${id}@example.com`,
    displayNameEn: name,
    ...overrides,
  };
}

const roster: AdminInstructorRecord[] = [
  jane,
  instructor('pat', 'Pat Frost', {
    approvalStatus: 'pending',
    isActive: false,
    stage: 'deactivated',
  }),
  instructor('ola', 'Ola Ridge', {
    approvalStatus: 'approved',
    stage: 'onboarding',
  }),
  instructor('max', 'Max Pine', {
    approvalStatus: 'approved',
    stage: 'onboarding',
  }),
  instructor('ida', 'Ida Peak', {
    approvalStatus: 'approved',
    stage: 'in_review',
  }),
  instructor('gus', 'Gus Slope', {
    approvalStatus: 'approved',
    stage: 'going_live',
  }),
  instructor('lea', 'Lea Glade', { approvalStatus: 'approved', stage: 'live' }),
  instructor('tom', 'Tom Bowl', { approvalStatus: 'approved', stage: 'live' }),
  instructor('una', 'Una Crest', { approvalStatus: 'approved', stage: 'live' }),
  instructor('rex', 'Rex Mogul', {
    approvalStatus: 'rejected',
    stage: 'rejected',
  }),
  instructor('vic', 'Vic Cornice', {
    approvalStatus: 'approved',
    isActive: false,
    stage: 'deactivated',
  }),
];

function serveRoster(rows: AdminInstructorRecord[]) {
  server.use(
    http.get(`${API}/admin/instructors`, () => HttpResponse.json(rows)),
  );
}

const expected: { stage: InstructorStage; label: string; count: number }[] = [
  { stage: 'pending', label: 'Pending', count: 1 },
  { stage: 'onboarding', label: 'Onboarding', count: 2 },
  { stage: 'in_review', label: 'Awaiting cert review', count: 1 },
  { stage: 'going_live', label: 'Going live', count: 1 },
  { stage: 'live', label: 'Live', count: 3 },
  { stage: 'rejected', label: 'Rejected', count: 1 },
  { stage: 'deactivated', label: 'Inactive', count: 2 },
];

describe('AdminDashboard (W2.6)', () => {
  it('shows counters and the needs-review queue', async () => {
    renderWithProviders(<AdminDashboard />);
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByText('Jane Snow')).toBeInTheDocument();
  });

  it('counts every instructor exactly once, under its stage', async () => {
    serveRoster(roster);
    renderWithProviders(<AdminDashboard />);
    for (const { label, count } of expected) {
      expect(
        await screen.findByRole('link', { name: `${count} ${label}` }),
      ).toBeInTheDocument();
    }
    const total = expected.reduce((sum, { count }) => sum + count, 0);
    expect(total).toBe(roster.length);
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
  });

  it('links each counter to the instructor list filtered to its stage', async () => {
    serveRoster(roster);
    renderWithProviders(<AdminDashboard />);
    for (const { stage, label, count } of expected) {
      const link = await screen.findByRole('link', {
        name: `${count} ${label}`,
      });
      expect(link).toHaveAttribute('href', `/admin/instructors?stage=${stage}`);
      const url = new URL(link.getAttribute('href') ?? '', 'http://portal');
      expect(url.pathname).toBe('/admin/instructors');
      expect(filtersFrom(url.searchParams).stages).toEqual([stage]);
    }
  });

  it('counts a deactivated pending instructor as Inactive and keeps them out of Needs review', async () => {
    serveRoster([
      jane,
      instructor('pat', 'Pat Frost', {
        approvalStatus: 'pending',
        isActive: false,
        stage: 'deactivated',
      }),
    ]);
    renderWithProviders(<AdminDashboard />);
    expect(
      await screen.findByRole('link', { name: '1 Pending' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '1 Inactive' }),
    ).toBeInTheDocument();
    const queue = screen.getByRole('link', { name: /Jane Snow/ });
    expect(within(queue).getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByText('Pat Frost')).not.toBeInTheDocument();
  });

  it('shows the empty queue when nobody is at the pending stage', async () => {
    serveRoster([
      instructor('pat', 'Pat Frost', {
        approvalStatus: 'pending',
        isActive: false,
        stage: 'deactivated',
      }),
    ]);
    renderWithProviders(<AdminDashboard />);
    expect(
      await screen.findByText('No instructors awaiting review.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0 Pending' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '1 Inactive' }),
    ).toBeInTheDocument();
  });

  it('labels the stage counters in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveRoster(roster);
    renderWithProviders(<AdminDashboard />);
    for (const [label, count] of [
      ['待审核', 1],
      ['入职中', 2],
      ['审核中', 1],
      ['上线中', 1],
      ['已上线', 3],
      ['已拒绝', 1],
      ['已停用', 2],
    ] as const) {
      expect(
        await screen.findByRole('link', { name: `${count} ${label}` }),
      ).toBeInTheDocument();
    }
  });
});
