import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import { Button, buttonClasses } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { en } from '@/i18n/messages/en';
import { zhCN } from '@/i18n/messages/zh-CN';
import { captureError } from '@/lib/analytics';
import { cn } from '@/lib/cn';

const COPY = [
  { lang: 'en', font: 'font-body', text: en.errors },
  { lang: 'zh-CN', font: 'font-cjk', text: zhCN.errors },
];

export function RouteErrorPage({ inShell = false }: { inShell?: boolean }) {
  const error = useRouteError();

  useEffect(() => {
    captureError(error);
  }, [error]);

  const copy =
    document.documentElement.lang === 'zh-CN' ? [...COPY].reverse() : COPY;

  return (
    <div
      translate="no"
      className={cn(
        'notranslate flex justify-center py-12',
        !inShell && 'min-h-screen items-center bg-canvas px-6',
      )}
    >
      <div className="w-full max-w-md">
        {!inShell && <Logo className="mb-8 h-12" />}
        <div role="alert" className="flex flex-col gap-5">
          {copy.map(({ lang, font, text }, index) => {
            const Heading = index === 0 ? 'h1' : 'h2';
            return (
              <div key={lang} lang={lang} className={font}>
                <Heading className="text-2xl">{text.crashTitle}</Heading>
                <p className="mt-1.5 text-slate">{text.crashBody}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" onClick={() => window.location.reload()}>
            {copy.map(({ lang, font, text }) => (
              <span key={lang} lang={lang} className={font}>
                {text.reload}
              </span>
            ))}
          </Button>
          <a href="/" className={buttonClasses({ variant: 'secondary' })}>
            {copy.map(({ lang, font, text }) => (
              <span key={lang} lang={lang} className={font}>
                {text.goHome}
              </span>
            ))}
          </a>
        </div>
      </div>
    </div>
  );
}
