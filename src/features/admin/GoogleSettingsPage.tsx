import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Card, Spinner } from '@/components';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/date';
import type { GoogleConnectionStatus } from '@/lib/types';
import {
  useConnectGoogle,
  useDisconnectGoogle,
  useGoogleCalendars,
  useGoogleStatus,
} from './googleApi';

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function GoogleSettingsPage() {
  const t = useT();
  const status = useGoogleStatus();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">{t.google.title}</h1>
        <p className="text-sm text-slate">{t.google.intro}</p>
      </div>
      <ReturnBanner />
      {status.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : status.data ? (
        <>
          <ConnectionCard status={status.data} />
          {status.data.connected && <CalendarsCard />}
        </>
      ) : (
        <Card>
          <Banner tone="error">
            {errorText(status.error, t.errors.generic)}
          </Banner>
        </Card>
      )}
    </div>
  );
}

function ReturnBanner() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const connected = params.get('connected') === '1';
  const error = params.get('error');
  if (!connected && !error) return null;

  const dismiss = () => {
    const next = new URLSearchParams(params);
    next.delete('connected');
    next.delete('error');
    setParams(next, { replace: true });
  };

  const errorMessages: Record<string, string> = t.google.returnErrors;
  const body = error
    ? (errorMessages[error] ??
      t.google.returnErrorUnknown.replace('{code}', error))
    : t.google.returnConnectedBody;

  return (
    <div className="flex flex-col gap-2">
      <Banner
        tone={error ? 'error' : 'approved'}
        title={
          error ? t.google.returnErrorTitle : t.google.returnConnectedTitle
        }
      >
        {body}
      </Banner>
      <div>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          {t.google.dismiss}
        </Button>
      </div>
    </div>
  );
}

function ConnectionCard({ status }: { status: GoogleConnectionStatus }) {
  const t = useT();
  const { locale } = useLocale();
  const connect = useConnectGoogle();
  const disconnect = useDisconnectGoogle();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-lg">{t.google.connectionTitle}</h2>
          <span className="text-sm text-slate" data-testid="google-state">
            {status.connected ? t.google.connected : t.google.notConnected}
          </span>
        </div>
        {status.connected
          ? !confirming && (
              <Button
                variant="secondary"
                onClick={() => {
                  disconnect.reset();
                  setConfirming(true);
                }}
              >
                {t.google.disconnect}
              </Button>
            )
          : status.configured && (
              <Button
                loading={connect.isPending || connect.isSuccess}
                onClick={() => connect.mutate()}
              >
                {t.google.connect}
              </Button>
            )}
      </div>

      {!status.connected &&
        (status.configured ? (
          <p className="text-sm text-ink">{t.google.notConnectedBody}</p>
        ) : (
          <Banner tone="pending">{t.google.returnErrors.not_configured}</Banner>
        ))}

      {connect.isError && (
        <Banner tone="error">
          {errorText(connect.error, t.errors.generic)}
        </Banner>
      )}

      {confirming && status.connected && (
        <div
          role="alertdialog"
          aria-labelledby="google-disconnect-title"
          className="flex flex-col gap-3 rounded-md border-l-[3px] border-l-navy bg-navy-tint px-4 py-3 text-sm text-ink"
        >
          <p id="google-disconnect-title" className="font-semibold">
            {t.google.disconnectTitle}
          </p>
          <p>{t.google.disconnectBody}</p>
          {disconnect.isError && (
            <Banner tone="error">
              {errorText(disconnect.error, t.errors.generic)}
            </Banner>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={disconnect.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => setConfirming(false),
                })
              }
            >
              {t.google.disconnectConfirm}
            </Button>
          </div>
        </div>
      )}

      {disconnect.isSuccess && !status.connected && (
        <Banner tone="approved">{t.google.disconnected}</Banner>
      )}

      {status.lastError && (
        <Banner tone="error" title={t.google.lastError}>
          {status.lastError}
        </Banner>
      )}

      {status.connected && (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Detail
            label={t.google.account}
            value={<span className="font-mono">{status.accountEmail}</span>}
          />
          <Detail
            label={t.google.connectedAt}
            value={
              status.connectedAt
                ? formatDateTime(status.connectedAt, locale)
                : t.google.unknown
            }
          />
          <div className="flex flex-col gap-0.5 sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate">
              {t.google.scopes}
            </dt>
            <dd>
              <ul className="flex flex-col gap-0.5">
                {status.scopes.map((scope) => (
                  <li
                    key={scope}
                    className="break-all font-mono text-xs text-ink"
                  >
                    {scope}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function CalendarsCard() {
  const t = useT();
  const calendars = useGoogleCalendars();
  const roleLabels: Record<string, string> = t.google.roles;

  let content: ReactNode;
  if (calendars.isLoading) {
    content = (
      <div className="flex justify-center py-10">
        <Spinner className="h-6 w-6" />
      </div>
    );
  } else if (calendars.isError) {
    content = (
      <Banner tone="error">
        {errorText(calendars.error, t.errors.generic)}
      </Banner>
    );
  } else if (!calendars.data?.length) {
    content = <p className="text-sm text-slate">{t.google.calendarsEmpty}</p>;
  } else {
    const readOnlyCount = calendars.data.filter((c) => !c.canWrite).length;
    content = (
      <>
        {readOnlyCount > 0 && (
          <Banner tone="pending">
            {t.google.readOnlySummary.replace('{count}', String(readOnlyCount))}
          </Banner>
        )}
        <div className="-mx-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{t.google.calendarsTitle}</caption>
            <thead>
              <tr className="border-y border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                <th className="px-6 py-3 font-medium">{t.google.colName}</th>
                <th className="px-6 py-3 font-medium">{t.google.colId}</th>
                <th className="whitespace-nowrap px-6 py-3 font-medium">
                  {t.google.colAccess}
                </th>
              </tr>
            </thead>
            <tbody>
              {calendars.data.map((cal, i) => (
                <tr key={cal.id} className={cn(i % 2 === 1 && 'bg-sunken')}>
                  <td className="px-6 py-3 font-medium text-ink">
                    {cal.summary}
                  </td>
                  <td className="break-all px-6 py-3 font-mono text-xs text-slate">
                    {cal.id}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">
                    <span className="flex items-center gap-2">
                      <span>
                        {roleLabels[cal.accessRole] ?? cal.accessRole}
                      </span>
                      {!cal.canWrite && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-sm border-l-[3px] border-status-pending bg-status-pending/10 px-2 py-0.5 text-xs font-medium text-ink"
                          title={t.google.cannotWriteHint}
                        >
                          {t.google.cannotWrite}
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">{t.google.calendarsTitle}</h2>
        <p className="text-sm text-slate">{t.google.calendarsIntro}</p>
      </div>
      {content}
    </Card>
  );
}
