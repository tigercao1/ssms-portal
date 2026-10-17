import { cn } from '@/lib/cn';
import type { DocumentLanguage } from '../api';

const DISPLAY_ORDER: readonly DocumentLanguage[] = ['en', 'zh'];

export interface DocumentLanguageSwitchProps {
  languages: readonly DocumentLanguage[];
  value: DocumentLanguage | null;
  labels: Record<DocumentLanguage, string>;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (language: DocumentLanguage) => void;
}

export function DocumentLanguageSwitch({
  languages,
  value,
  labels,
  label,
  disabled = false,
  disabledReason,
  onChange,
}: DocumentLanguageSwitchProps) {
  return (
    <div
      role="group"
      aria-label={label}
      title={disabled ? disabledReason : undefined}
      className="inline-flex overflow-hidden rounded-md border border-grey text-xs"
    >
      {DISPLAY_ORDER.filter((language) => languages.includes(language)).map(
        (language) => (
          <button
            key={language}
            type="button"
            aria-pressed={value === language}
            disabled={disabled && value !== language}
            onClick={() => {
              if (value !== language) onChange(language);
            }}
            className={cn(
              'px-2.5 py-1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              value === language
                ? 'bg-navy text-white'
                : 'bg-surface text-slate hover:bg-navy-tint',
            )}
          >
            {labels[language]}
          </button>
        ),
      )}
    </div>
  );
}
