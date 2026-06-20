import { useLocale } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';

/** Compact EN / 中文 switch (W1.5). Persists via the i18n provider. */
export function LangSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const opts: Array<{ value: 'en' | 'zh-CN'; label: string }> = [
    { value: 'en', label: 'EN' },
    { value: 'zh-CN', label: '中文' },
  ];
  return (
    <div
      className={cn(
        'inline-flex overflow-hidden rounded-md border border-grey text-xs',
        className,
      )}
    >
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setLocale(o.value)}
          aria-pressed={locale === o.value}
          className={cn(
            'px-2.5 py-1 font-medium transition-colors',
            locale === o.value
              ? 'bg-navy text-white'
              : 'bg-surface text-slate hover:bg-navy-tint',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
