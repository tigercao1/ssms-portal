import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import type { Field, SignatureValue } from '../api';
import { pdfRectToScreen, type PageGeometry } from '../pdf/transforms';
import { isLockedField, isSignatureField } from './fieldLogic';
import { TYPED_SIGNATURE_FONT } from './SignatureModal';
import type { SignerText } from './types';

interface FieldOverlayProps {
  field: Field;
  label: string;
  geometry: PageGeometry;
  value: string | boolean | undefined;
  signature: SignatureValue | undefined;
  active: boolean;
  text: SignerText;
  onFocus: () => void;
  onChange: (value: string | boolean) => void;
  onSign: () => void;
}

/** One input drawn over its field rect on the rendered page. */
export function FieldOverlay({
  field,
  label,
  geometry,
  value,
  signature,
  active,
  text,
  onFocus,
  onChange,
  onSign,
}: FieldOverlayProps) {
  const rect = pdfRectToScreen(geometry, field);
  const fontSize = Math.max(9, Math.min(rect.height * 0.6, 18));
  const filled = isSignatureField(field)
    ? Boolean(signature)
    : field.type === 'checkbox'
      ? value === true
      : typeof value === 'string' && value.trim().length > 0;
  const style: CSSProperties = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    fontSize,
  };
  const frame = cn(
    'absolute flex items-center overflow-hidden rounded-sm transition-shadow',
    active
      ? 'z-10 border-2 border-red bg-red-tint shadow-[0_0_0_4px_rgba(180,55,58,0.18)]'
      : filled
        ? 'border border-grey bg-white/70'
        : field.required
          ? 'border-2 border-dashed border-status-pending bg-[#fdf8ee]'
          : 'border border-dashed border-grey bg-white/60',
  );
  const accessibleLabel = field.required ? `${label} (${text.requiredMark})` : label;

  if (isSignatureField(field)) {
    return (
      <button
        type="button"
        data-field-id={field.id}
        aria-label={accessibleLabel}
        aria-pressed={filled}
        className={cn(frame, 'justify-center px-1 text-left')}
        style={style}
        onFocus={onFocus}
        onClick={onSign}
      >
        {signature?.mode === 'drawn' ? (
          <img
            alt=""
            src={`data:image/png;base64,${signature.png}`}
            className="h-full w-full object-contain"
          />
        ) : signature?.mode === 'typed' ? (
          <span
            className="truncate text-navy"
            style={{ fontFamily: TYPED_SIGNATURE_FONT, fontSize: fontSize * 1.3 }}
          >
            {signature.text}
          </span>
        ) : (
          <span className="truncate font-medium text-ink">
            ✎ {label} — {field.type === 'initials' ? text.tapToInitial : text.tapToSign}
          </span>
        )}
      </button>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label
        className={cn(frame, 'cursor-pointer justify-center')}
        style={style}
        data-field-id={field.id}
      >
        <input
          type="checkbox"
          aria-label={accessibleLabel}
          checked={value === true}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.checked)}
          className="h-[70%] max-h-5 w-[70%] max-w-5 accent-[var(--navy)]"
        />
      </label>
    );
  }

  if (isLockedField(field)) {
    return (
      <div
        className={cn(frame, 'px-1 text-ink')}
        style={style}
        data-field-id={field.id}
        tabIndex={0}
        role="textbox"
        aria-readonly="true"
        aria-label={accessibleLabel}
        onFocus={onFocus}
      >
        <span className="truncate">{typeof value === 'string' ? value : ''}</span>
      </div>
    );
  }

  return (
    <div className={frame} style={style} data-field-id={field.id}>
      <input
        type={field.type === 'date' ? 'date' : 'text'}
        aria-label={accessibleLabel}
        placeholder={label}
        value={typeof value === 'string' ? value : ''}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full bg-transparent px-1 text-ink placeholder:text-slate focus:outline-none"
        style={{ fontSize }}
      />
    </div>
  );
}
