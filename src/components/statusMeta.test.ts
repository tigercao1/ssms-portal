import { describe, expect, it } from 'vitest';
import { INSTRUCTOR_STAGES, stageMeta, statusMeta } from './statusMeta';
import { en } from '@/i18n/messages/en';
import { zhCN } from '@/i18n/messages/zh-CN';

describe('statusMeta', () => {
  it.each([
    ['pending', true, 'Pending', '待审核'],
    ['approved', true, 'Approved', '已通过'],
    ['approved', false, 'Inactive', '已停用'],
    ['rejected', true, 'Rejected', '已拒绝'],
    ['pending', false, 'Inactive', '已停用'],
    ['rejected', false, 'Inactive', '已停用'],
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

describe('stageMeta', () => {
  it.each([
    ['pending', 'Pending', '待审核', 'var(--status-pending)'],
    ['rejected', 'Rejected', '已拒绝', 'var(--status-rejected)'],
    ['deactivated', 'Inactive', '已停用', 'var(--status-inactive)'],
    ['onboarding', 'Onboarding', '入职中', 'var(--status-pending)'],
    ['in_review', 'In review', '审核中', 'var(--status-pending)'],
    ['going_live', 'Going live', '上线中', 'var(--navy)'],
    ['live', 'Live', '已上线', 'var(--status-live)'],
  ] as const)('shows %s as %s / %s in %s', (stage, enLabel, zhLabel, color) => {
    expect(stageMeta(stage, en)).toMatchObject({ label: enLabel, color });
    expect(stageMeta(stage, zhCN).label).toBe(zhLabel);
  });

  it('matches the approval status visuals for the approval stages', () => {
    expect(stageMeta('pending', en)).toEqual(statusMeta('pending', true, en));
    expect(stageMeta('rejected', en)).toEqual(statusMeta('rejected', true, en));
    expect(stageMeta('deactivated', en)).toEqual(
      statusMeta('approved', false, en),
    );
  });

  it('covers every stage', () => {
    expect(INSTRUCTOR_STAGES.map((s) => stageMeta(s, en).label)).toHaveLength(
      7,
    );
  });
});
