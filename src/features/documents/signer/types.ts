import type { Messages } from '@/i18n/core/types';

export type SignerText = Messages['signer'];

export type { SignatureValue } from '../api';

export const MAX_SIGNATURE_PNG_BYTES = 200 * 1024;
