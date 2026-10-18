import type { ComponentProps } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { Button } from '@/components';

interface ResendButtonProps extends ComponentProps<typeof Button> {
  busy: boolean;
  secondsLeft: number;
}

export function ResendButton({
  busy,
  secondsLeft,
  disabled,
  children,
  ...rest
}: ResendButtonProps) {
  const t = useT();
  return (
    <Button {...rest} loading={busy} disabled={disabled || secondsLeft > 0}>
      {secondsLeft > 60
        ? t.auth.resendInMinutes.replace(
            '{minutes}',
            String(Math.ceil(secondsLeft / 60)),
          )
        : secondsLeft > 0
          ? t.auth.resendIn.replace('{seconds}', String(secondsLeft))
          : children}
    </Button>
  );
}
