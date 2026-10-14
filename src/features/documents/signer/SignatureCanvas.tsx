import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import SignaturePad from 'signature_pad';

/** Imperative handle exposed by {@link SignatureCanvas}. */
export interface SignatureCanvasHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toPngBase64: (maxBytes: number) => string | null;
}

interface SignatureCanvasProps {
  label: string;
  onChange: (empty: boolean) => void;
  className?: string;
}

const PNG_PREFIX = 'data:image/png;base64,';

export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function canvasToBase64(canvas: HTMLCanvasElement): string {
  const url = canvas.toDataURL('image/png');
  return url.startsWith(PNG_PREFIX) ? url.slice(PNG_PREFIX.length) : '';
}

function downscale(source: HTMLCanvasElement, factor: number): string {
  const scaled = document.createElement('canvas');
  scaled.width = Math.max(1, Math.round(source.width * factor));
  scaled.height = Math.max(1, Math.round(source.height * factor));
  const ctx = scaled.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, 0, 0, scaled.width, scaled.height);
  return canvasToBase64(scaled);
}

/** Thin React wrapper around signature_pad that keeps the canvas sharp on resize. */
export const SignatureCanvas = forwardRef<
  SignatureCanvasHandle,
  SignatureCanvasProps
>(function SignatureCanvas({ label, onChange, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, {
      penColor: '#1b2a4a',
      minWidth: 0.8,
      maxWidth: 2.6,
    });
    padRef.current = pad;
    const handleEnd = () => onChangeRef.current(pad.isEmpty());
    pad.addEventListener('endStroke', handleEnd);

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
      if (data.length) pad.fromData(data);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      pad.removeEventListener('endStroke', handleEnd);
      pad.off();
      padRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      padRef.current?.clear();
      onChangeRef.current(true);
    },
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    toPngBase64: (maxBytes: number) => {
      const canvas = canvasRef.current;
      const pad = padRef.current;
      if (!canvas || !pad || pad.isEmpty()) return null;
      let factor = 1;
      let png = canvasToBase64(canvas);
      while (png && base64ByteLength(png) > maxBytes && factor > 0.2) {
        factor /= 2;
        png = downscale(canvas, factor);
      }
      return png && base64ByteLength(png) <= maxBytes ? png : null;
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      aria-label={label}
      role="img"
      className={className}
      style={{ touchAction: 'none' }}
    />
  );
});
