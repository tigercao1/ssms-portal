export type ApiTokenStatus = 'active' | 'expired' | 'revoked' | 'rotating';

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: ApiTokenStatus;
}

export interface IssuedApiToken {
  id: string;
  name: string;
  token: string;
  prefix: string;
  last4: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface CreateApiTokenBody {
  name: string;
  expiresAt: string | null;
}

export interface RotateApiTokenBody {
  graceMinutes: number;
}
