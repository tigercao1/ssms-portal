import type { SignatureValue } from './types';

export type SignerFieldType =
  | 'signature'
  | 'initials'
  | 'full_name'
  | 'date'
  | 'text'
  | 'checkbox';

/** The parts of a template field the signer needs. */
export interface SignerFieldLike {
  id: string;
  type: SignerFieldType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  required: boolean;
  prefill?: 'full_name' | 'email' | 'date_signed' | null;
}

export type FieldValues = Record<string, string | boolean>;
export type FieldSignatures = Record<string, SignatureValue>;

export interface SignerIdentity {
  signerName: string;
  email?: string | null;
  today: string;
}

export interface SignBody {
  consent: true;
  signerName: string;
  values: FieldValues;
  signatures: FieldSignatures;
}

export function isSignatureField(field: Pick<SignerFieldLike, 'type'>): boolean {
  return field.type === 'signature' || field.type === 'initials';
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Reading order: page, then top to bottom (PDF y grows upwards), then left to right. */
export function orderFields<F extends SignerFieldLike>(fields: readonly F[]): F[] {
  return [...fields].sort(
    (a, b) => a.page - b.page || b.y + b.h - (a.y + a.h) || a.x - b.x,
  );
}

/** Whether a field's value is locked to the signer's identity or the signing date. */
export function isLockedField(field: SignerFieldLike): boolean {
  return (
    field.type === 'full_name' ||
    field.prefill === 'full_name' ||
    field.prefill === 'email' ||
    field.prefill === 'date_signed'
  );
}

export function prefilledValue(
  field: SignerFieldLike,
  identity: SignerIdentity,
): string | boolean | undefined {
  if (field.type === 'checkbox') return false;
  if (isSignatureField(field)) return undefined;
  if (field.type === 'full_name' || field.prefill === 'full_name')
    return identity.signerName;
  if (field.prefill === 'email') return identity.email ?? '';
  if (field.prefill === 'date_signed') return identity.today;
  return '';
}

export function initialValues(
  fields: readonly SignerFieldLike[],
  identity: SignerIdentity,
): FieldValues {
  const values: FieldValues = {};
  for (const field of fields) {
    const value = prefilledValue(field, identity);
    if (value !== undefined) values[field.id] = value;
  }
  return values;
}

export function syncLockedValues(
  fields: readonly SignerFieldLike[],
  values: FieldValues,
  identity: SignerIdentity,
): FieldValues {
  const next = { ...values };
  for (const field of fields) {
    if (!isLockedField(field)) continue;
    const value = prefilledValue(field, identity);
    if (value !== undefined) next[field.id] = value;
  }
  return next;
}

export function isFieldFilled(
  field: SignerFieldLike,
  values: FieldValues,
  signatures: FieldSignatures,
): boolean {
  if (isSignatureField(field)) return Boolean(signatures[field.id]);
  const value = values[field.id];
  if (field.type === 'checkbox') return value === true;
  return typeof value === 'string' && value.trim().length > 0;
}

export function missingRequired<F extends SignerFieldLike>(
  fields: readonly F[],
  values: FieldValues,
  signatures: FieldSignatures,
): F[] {
  return orderFields(fields).filter(
    (f) => f.required && !isFieldFilled(f, values, signatures),
  );
}

/** Builds the `sign` completion body exactly as the API contract defines it. */
export function buildSignBody(
  fields: readonly SignerFieldLike[],
  signerName: string,
  values: FieldValues,
  signatures: FieldSignatures,
): SignBody {
  const outValues: FieldValues = {};
  const outSignatures: FieldSignatures = {};
  for (const field of fields) {
    if (isSignatureField(field)) {
      const signature = signatures[field.id];
      if (signature) outSignatures[field.id] = signature;
      continue;
    }
    const value = values[field.id];
    if (field.type === 'checkbox') {
      outValues[field.id] = value === true;
    } else if (typeof value === 'string' && value.trim().length > 0) {
      outValues[field.id] = value.trim();
    }
  }
  return {
    consent: true,
    signerName: signerName.trim(),
    values: outValues,
    signatures: outSignatures,
  };
}
