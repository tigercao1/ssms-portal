import type { ReactNode } from 'react';
import { Brandmark, Contour, Logo } from '@/components';
import { LangSwitch } from '@/components/LangSwitch';
import { useT } from '@/i18n/core/I18nProvider';

/**
 * Split auth layout (PORTAL_UI_PLAN.md): navy contour panel (brand) on the left,
 * the form card on the right. One orchestrated load — the panel content rises in.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="grid min-h-screen lg:grid-cols-[2fr_3fr]">
      <aside className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Contour className="pointer-events-none absolute inset-0 h-full w-full text-white" />
        <div className="relative animate-[rise_600ms_var(--ease)_both]">
          <Brandmark size={132} />
        </div>
        <div className="relative animate-[rise_700ms_var(--ease)_both]">
          <h1 className="max-w-xs text-4xl leading-tight text-white">
            {t.common.appName}
          </h1>
          <p className="mt-3 max-w-xs text-white/70">{t.common.tagline}</p>
        </div>
        <div className="relative" aria-hidden />
      </aside>

      <main className="relative flex items-center justify-center bg-canvas px-6 py-12">
        <div className="absolute right-6 top-6">
          <LangSwitch />
        </div>
        <div className="w-full max-w-sm">
          {/* Big red logo on white — the brand on the content side, and the only
              brand element on mobile where the navy panel is hidden. */}
          <Logo className="mb-8 h-16 w-auto lg:hidden" />
          {children}
        </div>
      </main>

      <style>{`@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
