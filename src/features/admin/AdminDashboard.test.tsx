import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { AdminDashboard } from './AdminDashboard';
import { renderWithProviders } from '@/test/render';

describe('AdminDashboard (W2.6)', () => {
  it('shows counters and the needs-review queue', async () => {
    renderWithProviders(<AdminDashboard />);
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    // the one pending instructor surfaces in the queue
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByText('Jane Snow')).toBeInTheDocument();
  });
});
