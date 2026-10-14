import type { ConsentText } from '../api';

interface ConsentBlockProps {
  consentText: ConsentText;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** The API's bilingual e-sign consent text, shown verbatim, with the required consent checkbox. */
export function ConsentBlock({
  consentText,
  checked,
  onChange,
  label,
}: ConsentBlockProps) {
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
        <span lang="en">{consentText.en}</span>
        <span lang="zh-CN" className="font-cjk">
          {consentText.zh}
        </span>
      </span>
    </label>
  );
}
