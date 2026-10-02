import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { AdminDetailPage } from './AdminDetailPage';
import { renderWithProviders } from '@/test/render';
import { fakeAdminList, server } from '@/test/msw';
import type { AdminInstructorRecord } from '@/lib/types';

const API = 'http://localhost:3000';

const session = vi.hoisted(() => ({ userId: 'admin-self' }));

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({
    isAdmin: true,
    user: { id: session.userId, email: 'admin@example.com' },
    signOut: vi.fn(),
  }),
}));

function serveRecord(overrides: Partial<AdminInstructorRecord>) {
  let record: AdminInstructorRecord = {
    ...(fakeAdminList[0] as AdminInstructorRecord),
    ...overrides,
  };
  const activationBodies: unknown[] = [];
  server.use(
    http.get(`${API}/admin/instructors/:id`, () => HttpResponse.json(record)),
    http.patch(
      `${API}/admin/instructors/:id/activation`,
      async ({ request }) => {
        const body = (await request.json()) as { isActive: boolean };
        activationBodies.push(body);
        record = {
          ...record,
          isActive: body.isActive,
          updatedAt: new Date().toISOString(),
        };
        return HttpResponse.json(record);
      },
    ),
  );
  return activationBodies;
}

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/instructors/:id" element={<AdminDetailPage />} />
    </Routes>,
    { route: '/admin/instructors/inst-1' },
  );
}

beforeEach(() => {
  session.userId = 'admin-self';
});

describe('AdminDetailPage actions', () => {
  it('takes an active instructor offline only after confirming', async () => {
    const bodies = serveRecord({ approvalStatus: 'approved', isActive: true });
    renderDetail();

    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Put online' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Take offline' }));
    expect(screen.getByText(/notified by email/)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(bodies).toEqual([{ isActive: false }]));
    expect(
      await screen.findByRole('button', { name: 'Put online' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('puts an inactive instructor back online after confirming', async () => {
    const bodies = serveRecord({ approvalStatus: 'approved', isActive: false });
    renderDetail();

    expect(await screen.findByText('Inactive')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Put online' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(bodies).toEqual([{ isActive: true }]));
  });

  it('cancelling the confirm step sends nothing', async () => {
    const bodies = serveRecord({ approvalStatus: 'approved', isActive: true });
    renderDetail();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Take offline' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.getByRole('button', { name: 'Take offline' }),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it('groups approve and reject for pending instructors without an offline action', async () => {
    serveRecord({ approvalStatus: 'pending', isActive: true });
    renderDetail();

    expect(
      await screen.findByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Take offline' }),
    ).not.toBeInTheDocument();
  });
});
