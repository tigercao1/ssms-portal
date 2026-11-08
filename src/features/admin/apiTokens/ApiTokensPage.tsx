import { useState, type ReactNode } from 'react';
import {
  Banner,
  Button,
  Card,
  DotPill,
  EmptyState,
  Spinner,
} from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { formatDate, formatDateTime } from '@/lib/date';
import { tokenErrorText, useApiTokens } from './apiTokensApi';
import {
  CreateTokenDialog,
  RevokeTokenDialog,
  RotateTokenDialog,
  SecretDialog,
} from './TokenDialogs';
import type { ApiToken, ApiTokenStatus, IssuedApiToken } from './types';

type Dialog =
  | { kind: 'create' }
  | { kind: 'rotate'; token: ApiToken }
  | { kind: 'revoke'; token: ApiToken }
  | { kind: 'secret'; issued: IssuedApiToken; rotated: boolean }
  | null;

const STATUS_COLORS: Record<ApiTokenStatus, string> = {
  active: 'approved',
  rotating: 'pending',
  expired: 'inactive',
  revoked: 'rejected',
};

function StatusPill({ status, t }: { status: ApiTokenStatus; t: Messages }) {
  const color = STATUS_COLORS[status];
  return (
    <DotPill
      color={`var(--status-${color})`}
      textClass={`text-status-${color}`}
      label={t.apiTokens.status[status]}
    />
  );
}

export function ApiTokensPage() {
  const t = useT();
  const tokens = useApiTokens();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const close = () => setDialog(null);
  const showSecret = (issued: IssuedApiToken, rotated: boolean) =>
    setDialog({ kind: 'secret', issued, rotated });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h1 className="text-3xl">{t.apiTokens.title}</h1>
          <p className="text-sm text-slate">{t.apiTokens.intro}</p>
        </div>
        <Button
          onClick={() => {
            setNotice(null);
            setDialog({ kind: 'create' });
          }}
        >
          {t.apiTokens.create}
        </Button>
      </div>

      {notice && <Banner tone="approved">{notice}</Banner>}

      {tokens.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : tokens.isError ? (
        <Banner tone="error">{tokenErrorText(tokens.error, t)}</Banner>
      ) : !tokens.data?.length ? (
        <EmptyState title={t.apiTokens.empty}>
          {t.apiTokens.emptyBody}
        </EmptyState>
      ) : (
        <section
          aria-labelledby="api-tokens-list"
          className="flex flex-col gap-3"
        >
          <h2 id="api-tokens-list" className="text-lg">
            {t.apiTokens.listTitle}
          </h2>
          <ul className="flex flex-col gap-3">
            {tokens.data.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                onRotate={() => {
                  setNotice(null);
                  setDialog({ kind: 'rotate', token });
                }}
                onRevoke={() => {
                  setNotice(null);
                  setDialog({ kind: 'revoke', token });
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {dialog?.kind === 'create' && (
        <CreateTokenDialog
          onClose={close}
          onIssued={(issued) => showSecret(issued, false)}
        />
      )}
      {dialog?.kind === 'rotate' && (
        <RotateTokenDialog
          token={dialog.token}
          onClose={close}
          onIssued={(issued) => showSecret(issued, true)}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <RevokeTokenDialog
          token={dialog.token}
          onClose={close}
          onRevoked={() => {
            setNotice(t.apiTokens.revoked.replace('{name}', dialog.token.name));
            close();
          }}
        />
      )}
      {dialog?.kind === 'secret' && (
        <SecretDialog
          issued={dialog.issued}
          rotated={dialog.rotated}
          onClose={close}
        />
      )}
    </div>
  );
}

function TokenRow({
  token,
  onRotate,
  onRevoke,
}: {
  token: ApiToken;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const canRotate = token.status === 'active';
  const canRevoke = token.status === 'active' || token.status === 'rotating';

  return (
    <li aria-label={token.name}>
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-medium text-ink">
              {token.name}
            </h3>
            <StatusPill status={token.status} t={t} />
          </div>
          {(canRotate || canRevoke) && (
            <div className="flex gap-2">
              {canRotate && (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={t.apiTokens.rotateFor.replace(
                    '{name}',
                    token.name,
                  )}
                  onClick={onRotate}
                >
                  {t.apiTokens.rotate}
                </Button>
              )}
              {canRevoke && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t.apiTokens.revokeFor.replace(
                    '{name}',
                    token.name,
                  )}
                  onClick={onRevoke}
                >
                  {t.apiTokens.revoke}
                </Button>
              )}
            </div>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Detail label={t.apiTokens.colToken}>
            <span className="break-all font-mono text-xs">
              {token.prefix}…{token.last4}
            </span>
          </Detail>
          <Detail label={t.apiTokens.colCreated}>
            {formatDate(token.createdAt, locale)}
          </Detail>
          <Detail label={t.apiTokens.colExpires}>
            {token.expiresAt
              ? formatDate(token.expiresAt, locale)
              : t.apiTokens.neverExpires}
          </Detail>
          <Detail label={t.apiTokens.colLastUsed}>
            {token.lastUsedAt
              ? formatDateTime(token.lastUsedAt, locale)
              : t.apiTokens.neverUsed}
          </Detail>
        </dl>
      </Card>
    </li>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
