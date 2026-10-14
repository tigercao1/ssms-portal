import { type FormEvent, useEffect, useState } from 'react';
import { Banner, Button, Card, Field, Input, Spinner } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import { usePayrollSettings, useUpdatePayrollSettings } from './payrollApi';
import { errorText } from './payrollFormat';

export function PayrollSettingsPanel({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const settings = usePayrollSettings();
  const save = useUpdatePayrollSettings();
  const [anchorDate, setAnchorDate] = useState('');

  useEffect(() => {
    if (settings.data) setAnchorDate(settings.data.anchorDate);
  }, [settings.data]);

  const locked = settings.data?.locked ?? false;
  const changed = Boolean(
    settings.data && anchorDate && anchorDate !== settings.data.anchorDate,
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!changed || locked) return;
    save.mutate(anchorDate, { onSuccess: onSaved });
  }

  return (
    <Card>
      <div
        role="dialog"
        aria-labelledby="payroll-settings-title"
        className="flex flex-col gap-4"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="payroll-settings-title" className="text-lg">
            {t.payroll.settingsTitle}
          </h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t.payroll.close}
          </Button>
        </div>
        {settings.isLoading ? (
          <Spinner className="h-6 w-6" />
        ) : settings.isError ? (
          <Banner tone="error">
            {errorText(settings.error, t.errors.generic)}
          </Banner>
        ) : (
          <form
            onSubmit={onSubmit}
            noValidate
            className="flex flex-col gap-3 sm:max-w-sm"
          >
            {locked && (
              <Banner tone="pending">{t.payroll.settingsLocked}</Banner>
            )}
            <Field label={t.payroll.anchorLabel} hint={t.payroll.anchorHint}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={anchorDate}
                  disabled={locked}
                  onChange={(e) => {
                    setAnchorDate(e.target.value);
                    save.reset();
                  }}
                />
              )}
            </Field>
            {save.isError && (
              <Banner tone="error">
                {errorText(save.error, t.errors.generic)}
              </Banner>
            )}
            {save.isSuccess && (
              <Banner tone="approved">{t.payroll.settingsSaved}</Banner>
            )}
            <div>
              <Button
                type="submit"
                variant="secondary"
                disabled={locked || !changed}
                loading={save.isPending}
              >
                {t.common.save}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
