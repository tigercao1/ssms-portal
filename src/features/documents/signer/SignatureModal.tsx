import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@/components';
import { cn } from '@/lib/cn';
import { Sheet } from './Sheet';
import { SignatureCanvas, type SignatureCanvasHandle } from './SignatureCanvas';
import {
  MAX_SIGNATURE_PNG_BYTES,
  type SignatureValue,
  type SignerText,
} from './types';

type Mode = 'drawn' | 'typed';

interface SignatureModalProps {
  open: boolean;
  kind: 'signature' | 'initials';
  text: SignerText;
  defaultTypedText: string;
  onAdopt: (value: SignatureValue) => void;
  onClose: () => void;
}

export const SIGNATURE_WEB_FONTS = ['Dancing Script', 'Ma Shan Zheng'];

export const TYPED_SIGNATURE_FONT = [
  ...SIGNATURE_WEB_FONTS.map((family) => `'${family}'`),
  "'Brush Script MT', 'Kaiti SC', 'STKaiti', cursive",
].join(', ');

/** Draw / Type signature capture for a signature or initials field. */
export function SignatureModal({
  open,
  kind,
  text,
  defaultTypedText,
  onAdopt,
  onClose,
}: SignatureModalProps) {
  const [mode, setMode] = useState<Mode>('drawn');
  const [empty, setEmpty] = useState(true);
  const [typed, setTyped] = useState(defaultTypedText);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<SignatureCanvasHandle>(null);

  useEffect(() => {
    if (open) {
      setTyped(defaultTypedText);
      setEmpty(true);
      setError(null);
    }
  }, [open, defaultTypedText]);

  const title = kind === 'initials' ? text.initialsTitle : text.signatureTitle;
  const canAdopt = mode === 'drawn' ? !empty : typed.trim().length > 0;

  const adopt = () => {
    if (mode === 'typed') {
      onAdopt({ mode: 'typed', text: typed.trim() });
      return;
    }
    const png = canvasRef.current?.toPngBase64(MAX_SIGNATURE_PNG_BYTES);
    if (!png) {
      setError(text.signatureTooLarge);
      return;
    }
    onAdopt({ mode: 'drawn', png });
  };

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      className={cn(
        'flex-1 py-2 text-sm font-medium transition-colors',
        mode === value ? 'bg-navy text-white' : 'text-slate hover:bg-navy-tint',
      )}
    >
      {label}
    </button>
  );

  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          {mode === 'drawn' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => canvasRef.current?.clear()}
            >
              {text.clear}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            {text.cancel}
          </Button>
          <Button size="sm" disabled={!canAdopt} onClick={adopt}>
            {kind === 'initials' ? text.useInitials : text.useSignature}
          </Button>
        </>
      }
    >
      <div
        role="tablist"
        aria-label={title}
        className="mb-3 flex overflow-hidden rounded-md border border-grey"
      >
        {tab('drawn', text.draw)}
        {tab('typed', text.type)}
      </div>
      {mode === 'drawn' ? (
        <div className="relative">
          <SignatureCanvas
            ref={canvasRef}
            label={text.drawHere}
            onChange={(isEmpty) => {
              setEmpty(isEmpty);
              setError(null);
            }}
            className="h-40 w-full rounded-md border border-dashed border-grey bg-canvas"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 bottom-8 border-t border-grey"
          />
          <p className="mt-1 text-center text-xs text-slate">{text.drawHint}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label
            className="text-sm font-medium text-navy"
            htmlFor="typed-signature"
          >
            {text.typeLabel}
          </label>
          <Input
            id="typed-signature"
            value={typed}
            maxLength={kind === 'initials' ? 8 : 80}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div
            data-testid="typed-preview"
            className="ph-no-capture flex h-24 items-center justify-center overflow-hidden rounded-md border border-dashed border-grey bg-canvas px-3 text-3xl text-navy"
            style={{ fontFamily: TYPED_SIGNATURE_FONT }}
          >
            {typed}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-status-rejected">
          {error}
        </p>
      )}
    </Sheet>
  );
}
