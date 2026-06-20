import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Locale, Messages } from './types';
import { en } from '../messages/en';
import { zhCN } from '../messages/zh-CN';

const DICT: Record<Locale, Messages> = { en, 'zh-CN': zhCN };
const STORAGE_KEY = 'ssms.locale';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'zh-CN') return stored;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

/**
 * i18n provider (W1.5). Holds the active locale, persists it, and sets the
 * document `lang` so the CJK font (tokens.css `:lang`) applies for zh-CN. The
 * instructor's `preferred_language` is synced into this on profile load (W2.4).
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: DICT[locale] }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

/** Messages for the active locale: `const t = useT(); t.auth.signInTitle`. */
export function useT(): Messages {
  return useI18n().t;
}

/** Active locale + setter (for the language switch / profile sync). */
export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void } {
  const { locale, setLocale } = useI18n();
  return { locale, setLocale };
}
