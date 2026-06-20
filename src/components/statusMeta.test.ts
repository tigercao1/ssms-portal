import { describe, expect, it } from 'vitest';
import { statusMeta } from './statusMeta';
import { en } from '@/i18n/messages/en';

describe('statusMeta', () => {
  it('labels pending/approved/rejected', () => {
    expect(statusMeta('pending', true, en).label).toBe(en.status.pending);
    expect(statusMeta('approved', true, en).label).toBe(en.status.approved);
    expect(statusMeta('rejected', true, en).label).toBe(en.status.rejected);
  });
  it('shows inactive when approved but not active', () => {
    const meta = statusMeta('approved', false, en);
    expect(meta.label).toBe(en.status.inactive);
    expect(meta.color).toBe('var(--status-inactive)');
  });
});
