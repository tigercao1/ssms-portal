import { CONSENT_TEXT_EN, CONSENT_TEXT_ZH } from './consent';

interface ConsentBlockProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** Fixed bilingual e-sign consent text with the required consent checkbox. */
export function ConsentBlock({ checked, onChange, label }: ConsentBlockProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-grey/60 bg-canvas p-3 text-sm">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 flex-none accent-[var(--navy)]"
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-1.5">
        <span lang="en">{CONSENT_TEXT_EN}</span>
        <span lang="zh-CN" className="font-cjk">
          {CONSENT_TEXT_ZH}
        </span>
      </span>
    </label>
  );
}
