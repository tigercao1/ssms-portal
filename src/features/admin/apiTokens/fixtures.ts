import { http, HttpResponse } from 'msw';
import type {
  ApiToken,
  CreateApiTokenBody,
  IssuedApiToken,
  RotateApiTokenBody,
} from './types';

const API = 'http://localhost:3000';

export function fakeApiToken(overrides: Partial<ApiToken> = {}): ApiToken {
  return {
    id: 'tok-1',
    name: 'Claude Code laptop',
    prefix: 'ssms_pat_Ab3d',
    last4: 'x9Qz',
    createdAt: '2026-11-01T15:00:00Z',
    expiresAt: '2027-01-30T15:00:00Z',
    lastUsedAt: '2026-11-07T20:30:00Z',
    revokedAt: null,
    status: 'active',
    ...overrides,
  };
}

export const fakeApiTokens: ApiToken[] = [
  fakeApiToken(),
  fakeApiToken({
    id: 'tok-2',
    name: 'Nightly export',
    prefix: 'ssms_pat_Zz81',
    last4: 'k2Lm',
    expiresAt: null,
    lastUsedAt: null,
  }),
  fakeApiToken({
    id: 'tok-3',
    name: 'Old script',
    prefix: 'ssms_pat_Qr55',
    last4: 'p0Aa',
    createdAt: '2026-01-01T15:00:00Z',
    expiresAt: '2026-01-31T15:00:00Z',
    status: 'expired',
  }),
  fakeApiToken({
    id: 'tok-4',
    name: 'Leaked token',
    prefix: 'ssms_pat_Mm12',
    last4: 'r7Tt',
    revokedAt: '2026-10-15T12:00:00Z',
    status: 'revoked',
  }),
  fakeApiToken({
    id: 'tok-5',
    name: 'CI runner',
    prefix: 'ssms_pat_Cc90',
    last4: 'w3Ee',
    status: 'rotating',
  }),
];

export interface ApiTokensMockState {
  tokens: ApiToken[];
  creates: CreateApiTokenBody[];
  rotations: { id: string; body: RotateApiTokenBody }[];
  revocations: string[];
  nextId: number;
}

export function createApiTokensState(
  tokens: ApiToken[] = fakeApiTokens,
): ApiTokensMockState {
  return {
    tokens: structuredClone(tokens),
    creates: [],
    rotations: [],
    revocations: [],
    nextId: 100,
  };
}

function issue(
  state: ApiTokensMockState,
  name: string,
  expiresAt: string | null,
): IssuedApiToken {
  const n = state.nextId++;
  const token = `ssms_pat_secret${n}${'A'.repeat(43 - 6 - String(n).length)}`;
  const issued: IssuedApiToken = {
    id: `tok-${n}`,
    name,
    token,
    prefix: token.slice(0, 13),
    last4: token.slice(-4),
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  state.tokens.unshift({
    id: issued.id,
    name,
    prefix: issued.prefix,
    last4: issued.last4,
    createdAt: issued.createdAt,
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
    status: 'active',
  });
  return issued;
}

export function apiTokensHandlers(state: ApiTokensMockState) {
  return [
    http.get(`${API}/admin/api-tokens`, () => HttpResponse.json(state.tokens)),
    http.post(`${API}/admin/api-tokens`, async ({ request }) => {
      const body = (await request.json()) as CreateApiTokenBody;
      state.creates.push(body);
      return HttpResponse.json(issue(state, body.name, body.expiresAt), {
        status: 201,
      });
    }),
    http.post(
      `${API}/admin/api-tokens/:id/rotate`,
      async ({ request, params }) => {
        const id = String(params.id);
        const body = (await request.json()) as RotateApiTokenBody;
        state.rotations.push({ id, body });
        const old = state.tokens.find((tok) => tok.id === id)!;
        old.status = body.graceMinutes > 0 ? 'rotating' : 'revoked';
        return HttpResponse.json(issue(state, old.name, old.expiresAt), {
          status: 201,
        });
      },
    ),
    http.delete(`${API}/admin/api-tokens/:id`, ({ params }) => {
      const id = String(params.id);
      state.revocations.push(id);
      const tok = state.tokens.find((t) => t.id === id)!;
      tok.status = 'revoked';
      tok.revokedAt = new Date().toISOString();
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
