import { Card, DotPill, Spinner } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import { useMyCalendarStatus } from './api';
import { CALENDAR_GUIDE_URL } from './calendarGuide';

export function CalendarStatusCard({ enabled }: { enabled: boolean }) {
  const t = useT();
  const { data, isLoading } = useMyCalendarStatus(enabled);

  if (!enabled) return null;
  if (isLoading) return <Spinner className="self-center" />;
  if (!data) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl">{t.profile.calendarTitle}</h2>
        {data.connected ? (
          <DotPill
            color="var(--status-approved)"
            textClass="text-status-approved"
            label={t.profile.calendarConnected}
          />
        ) : (
          <DotPill
            color="var(--status-pending)"
            textClass="text-status-pending"
            label={t.profile.calendarNotConnected}
          />
        )}
      </div>
      {data.connected ? (
        <p className="text-sm text-slate">{t.profile.calendarConnectedBody}</p>
      ) : (
        <>
          <p className="text-sm text-slate">
            {t.profile.calendarNotConnectedBody}
          </p>
          <a
            href={CALENDAR_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center self-start whitespace-nowrap rounded-md border border-navy px-3 text-sm font-medium text-navy transition-colors duration-200 ease-brand hover:bg-navy-tint"
          >
            {t.profile.calendarGuide}
          </a>
        </>
      )}
    </Card>
  );
}
