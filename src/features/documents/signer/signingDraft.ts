import type { DocumentLanguage, SignatureValue } from '../api';
import {
  isSignatureField,
  type FieldSignatures,
  type FieldValues,
  type SignerFieldLike,
} from './fieldLogic';

export const DRAFT_KEY_PREFIX = 'ssms.signDraft.v1:';
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type AdoptedSignatures = Partial<
  Record<'signature' | 'initials', SignatureValue>
>;

export interface SigningDraft {
  signerName: string;
  values: FieldValues;
  signatures: FieldSignatures;
  adopted: AdoptedSignatures;
}

type StoredSignature = SignatureValue | { ref: 'signature' | 'initials' };

interface StoredDraft {
  templateId: string;
  savedAt: number;
  signerName: string;
  values: FieldValues;
  signatures: Record<string, StoredSignature>;
  adopted: AdoptedSignatures;
}

export function signingDraftKey(
  userId: string,
  assignmentId: string,
  language: DocumentLanguage | null = null,
): string {
  const base = `${DRAFT_KEY_PREFIX}${userId}:${assignmentId}`;
  return language ? `${base}:${language}` : base;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function sameSignature(a: SignatureValue, b: SignatureValue | undefined) {
  if (!b || a.mode !== b.mode) return false;
  return a.mode === 'drawn'
    ? a.png === (b as { png: string }).png
    : a.text === (b as { text: string }).text;
}

function isSignatureValue(v: unknown): v is SignatureValue {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    (s.mode === 'drawn' && typeof s.png === 'string') ||
    (s.mode === 'typed' && typeof s.text === 'string')
  );
}

function withoutDrawn(draft: StoredDraft): StoredDraft {
  const signatures: StoredDraft['signatures'] = {};
  for (const [id, s] of Object.entries(draft.signatures)) {
    if ('ref' in s) {
      if (draft.adopted[s.ref]?.mode !== 'drawn') signatures[id] = s;
    } else if (s.mode !== 'drawn') signatures[id] = s;
  }
  const adopted: AdoptedSignatures = {};
  for (const kind of ['signature', 'initials'] as const) {
    const a = draft.adopted[kind];
    if (a && a.mode !== 'drawn') adopted[kind] = a;
  }
  return { ...draft, signatures, adopted };
}

export function purgeStaleSigningDrafts(now = Date.now()): void {
  const store = storage();
  if (!store) return;
  const stale: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key?.startsWith(DRAFT_KEY_PREFIX)) continue;
    try {
      const parsed = JSON.parse(
        store.getItem(key) ?? '',
      ) as Partial<StoredDraft>;
      if (
        typeof parsed.savedAt !== 'number' ||
        now - parsed.savedAt > DRAFT_TTL_MS
      )
        stale.push(key);
    } catch {
      stale.push(key);
    }
  }
  stale.forEach((key) => store.removeItem(key));
}

export function loadSigningDraft(
  key: string,
  templateId: string,
  fields: readonly SignerFieldLike[],
  now = Date.now(),
): SigningDraft | null {
  const store = storage();
  if (!store) return null;
  purgeStaleSigningDrafts(now);
  let parsed: StoredDraft;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    parsed = JSON.parse(raw) as StoredDraft;
  } catch {
    store.removeItem(key);
    return null;
  }
  if (parsed.templateId !== templateId) {
    store.removeItem(key);
    return null;
  }
  const adopted: AdoptedSignatures = {};
  for (const kind of ['signature', 'initials'] as const) {
    const a = parsed.adopted?.[kind];
    if (isSignatureValue(a)) adopted[kind] = a;
  }
  const values: FieldValues = {};
  const signatures: FieldSignatures = {};
  for (const field of fields) {
    if (isSignatureField(field)) {
      const s = parsed.signatures?.[field.id];
      const value = s && 'ref' in s ? adopted[s.ref] : s;
      if (isSignatureValue(value)) signatures[field.id] = value;
      continue;
    }
    const v = parsed.values?.[field.id];
    if (typeof v === (field.type === 'checkbox' ? 'boolean' : 'string'))
      values[field.id] = v as string | boolean;
  }
  return {
    signerName: typeof parsed.signerName === 'string' ? parsed.signerName : '',
    values,
    signatures,
    adopted,
  };
}

export function saveSigningDraft(
  key: string,
  templateId: string,
  draft: SigningDraft,
  now = Date.now(),
): void {
  const store = storage();
  if (!store) return;
  const signatures: StoredDraft['signatures'] = {};
  for (const [id, s] of Object.entries(draft.signatures)) {
    const ref = (['signature', 'initials'] as const).find((kind) =>
      sameSignature(s, draft.adopted[kind]),
    );
    signatures[id] = ref ? { ref } : s;
  }
  const stored: StoredDraft = {
    templateId,
    savedAt: now,
    signerName: draft.signerName,
    values: draft.values,
    signatures,
    adopted: draft.adopted,
  };
  for (const candidate of [stored, withoutDrawn(stored)]) {
    try {
      store.setItem(key, JSON.stringify(candidate));
      return;
    } catch {
      continue;
    }
  }
  store.removeItem(key);
}

export function clearSigningDraft(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    return;
  }
}
