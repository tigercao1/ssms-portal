import type { Messages } from '@/i18n/core/types';

export type SignerText = Messages['signer'];

export type SignatureValue =
  | { mode: 'drawn'; png: string }
  | { mode: 'typed'; text: string };

export const MAX_SIGNATURE_PNG_BYTES = 200 * 1024;
