import { useRef } from 'react';
import type { SignLang } from './api';
import { SIGN_MESSAGES } from './messages';
import { useParentHeight } from './parentHeight';
import { allowedReturnUrl } from './returnUrl';
import { WaiverPage } from './WaiverPage';

const WAIVER_PATH = /^\/w\/([A-Za-z0-9_-]+)\/?$/;

export function parseSignLocation(
  location: Pick<Location, 'pathname' | 'search'>,
) {
  const params = new URLSearchParams(location.search);
  const lang: SignLang = params.get('lang') === 'en' ? 'en' : 'zh';
  return {
    slug: WAIVER_PATH.exec(location.pathname)?.[1] ?? null,
    lang,
    returnUrl: allowedReturnUrl(params.get('return')),
  };
}

export function SignApp({
  location = window.location,
}: {
  location?: Pick<Location, 'pathname' | 'search'>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useParentHeight(rootRef);
  const { slug, lang, returnUrl } = parseSignLocation(location);
  return (
    <div ref={rootRef} lang={SIGN_MESSAGES[lang].htmlLang}>
      <main className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6">
        {slug ? (
          <WaiverPage slug={slug} lang={lang} returnUrl={returnUrl} />
        ) : (
          <p role="alert" className="py-10 text-center">
            {SIGN_MESSAGES[lang].notFound}
          </p>
        )}
      </main>
    </div>
  );
}
