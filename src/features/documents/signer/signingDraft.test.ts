import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeField } from '../api/fixtures';
import {
  DRAFT_TTL_MS,
  clearSigningDraft,
  loadSigningDraft,
  purgeStaleSigningDrafts,
  saveSigningDraft,
  signingDraftKey,
  type SigningDraft,
} from './signingDraft';

const fields = [
  fakeField({ id: 'f_sig' }),
  fakeField({ id: 'f_sig2', page: 2 }),
  fakeField({ id: 'f_ini', type: 'initials' }),
  fakeField({ id: 'f_phone', type: 'text' }),
  fakeField({ id: 'f_agree', type: 'checkbox' }),
];
const key = signingDraftKey('user-1', 'asg-1');
const drawn = { mode: 'drawn', png: 'iVBORw0KGgo' } as const;
const typed = { mode: 'typed', text: '张三' } as const;
const now = Date.UTC(2026, 9, 15, 12);

function draft(overrides: Partial<SigningDraft> = {}): SigningDraft {
  return {
    signerName: 'Jane Snow',
    values: { f_phone: '555-0100', f_agree: true },
    signatures: { f_sig: drawn, f_sig2: drawn, f_ini: typed },
    adopted: { signature: drawn, initials: typed },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signing draft', () => {
  it('keys drafts by user and assignment', () => {
    expect(key).toBe('ssms.signDraft.v1:user-1:asg-1');
  });

  it('round-trips values and signatures, storing a reused signature once', () => {
    saveSigningDraft(key, 'tpl-1', draft(), now);
    const raw = localStorage.getItem(key) ?? '';
    expect(raw.split(drawn.png)).toHaveLength(2);
    expect(loadSigningDraft(key, 'tpl-1', fields, now)).toEqual(draft());
  });

  it('drops values for fields the template no longer has or whose type changed', () => {
    saveSigningDraft(
      key,
      'tpl-1',
      draft({
        values: { f_phone: '555', f_agree: 'yes', f_gone: 'x' },
        signatures: { f_sig: drawn, f_gone: typed },
      }),
      now,
    );
    const loaded = loadSigningDraft(key, 'tpl-1', fields, now);
    expect(loaded?.values).toEqual({ f_phone: '555' });
    expect(loaded?.signatures).toEqual({ f_sig: drawn });
  });

  it('discards a draft saved for another template', () => {
    saveSigningDraft(key, 'tpl-old', draft(), now);
    expect(loadSigningDraft(key, 'tpl-1', fields, now)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('discards unreadable drafts', () => {
    localStorage.setItem(key, '{not json');
    expect(loadSigningDraft(key, 'tpl-1', fields, now)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('purges drafts older than the TTL and keeps fresh ones', () => {
    const fresh = signingDraftKey('user-1', 'asg-2');
    saveSigningDraft(key, 'tpl-1', draft(), now - DRAFT_TTL_MS - 1);
    saveSigningDraft(fresh, 'tpl-1', draft(), now - 1000);
    localStorage.setItem('ssms.locale', 'zh-CN');
    purgeStaleSigningDrafts(now);
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(fresh)).not.toBeNull();
    expect(localStorage.getItem('ssms.locale')).toBe('zh-CN');
  });

  it('falls back to saving without drawn signatures when storage is full', () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      k: string,
      v: string,
    ) {
      if (v.includes(drawn.png))
        throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, k, v);
    });
    saveSigningDraft(key, 'tpl-1', draft(), now);
    expect(loadSigningDraft(key, 'tpl-1', fields, now)).toEqual(
      draft({ signatures: { f_ini: typed }, adopted: { initials: typed } }),
    );
  });

  it('removes the draft when nothing fits', () => {
    saveSigningDraft(key, 'tpl-1', draft(), now);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    saveSigningDraft(key, 'tpl-1', draft(), now);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('clears a draft', () => {
    saveSigningDraft(key, 'tpl-1', draft(), now);
    clearSigningDraft(key);
    expect(loadSigningDraft(key, 'tpl-1', fields, now)).toBeNull();
  });
});
