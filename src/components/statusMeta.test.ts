import { describe, expect, it } from 'vitest';
import { statusMeta } from './statusMeta';
import { en } from '@/i18n/messages/en';
import { zhCN } from '@/i18n/messages/zh-CN';

describe('statusMeta', () => {
  it.each([
    ['pending', true, 'Pending', '待审核'],
    ['approved', true, 'Active', '已上线'],
    ['approved', false, 'Inactive', '已下线'],
    ['rejected', true, 'Rejected', '已拒绝'],
  ] as const)(
    'labels %s (active=%s) as %s / %s',
    (status, isActive, enLabel, zhLabel) => {
      expect(statusMeta(status, isActive, en).label).toBe(enLabel);
      expect(statusMeta(status, isActive, zhCN).label).toBe(zhLabel);
    },
  );

  it('keeps the approved colour for active instructors', () => {
    expect(statusMeta('approved', true, en).color).toBe(
      'var(--status-approved)',
    );
  });

  it('uses the inactive colour when approved but not active', () => {
    expect(statusMeta('approved', false, en).color).toBe(
      'var(--status-inactive)',
    );
  });
});
