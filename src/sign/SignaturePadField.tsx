import { useEffect, useRef, useState } from 'react';
import SignaturePad, { type PointGroup } from 'signature_pad';
import type { SignMessages } from './messages';
import { exportSignaturePng } from './signatureExport';

interface SignaturePadFieldProps {
  label: string;
  text: SignMessages;
  invalid: boolean;
  onChange: (png: string | null, tooLarge: boolean) => void;
}

interface CanvasSize {
  width: number;
  height: number;
  ratio: number;
}

function emitSignature(
  pad: SignaturePad,
  canvas: HTMLCanvasElement,
  onChange: SignaturePadFieldProps['onChange'],
) {
  if (pad.isEmpty()) return onChange(null, false);
  const png = exportSignaturePng(canvas);
  onChange(png, png === null);
}

function scaleGroups(groups: PointGroup[], factor: number): PointGroup[] {
  return groups.map((group) => ({
    ...group,
    points: group.points.map((point) => ({
      ...point,
      x: point.x * factor,
      y: point.y * factor,
    })),
  }));
}

export function SignaturePadField({
  label,
  text,
  invalid,
  onChange,
}: SignaturePadFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const redoRef = useRef<PointGroup[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [strokes, setStrokes] = useState(0);
  const [redoable, setRedoable] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, {
      penColor: '#1b2a4a',
      minWidth: 0.8,
      maxWidth: 2.6,
    });
    padRef.current = pad;
    let size: CanvasSize | null = null;

    const emit = () => {
      setStrokes(pad.toData().length);
      setRedoable(redoRef.current.length);
      emitSignature(pad, canvas, onChangeRef.current);
    };
    const startStroke = () => {
      redoRef.current = [];
    };

    const fit = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      if (!width || !height) return;
      if (
        size &&
        size.width === width &&
        size.height === height &&
        size.ratio === ratio
      )
        return;
      const factor = size
        ? Math.min(width / size.width, height / size.height)
        : 1;
      const data = pad.toData();
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
      if (factor !== 1) redoRef.current = scaleGroups(redoRef.current, factor);
      if (data.length) {
        pad.fromData(factor === 1 ? data : scaleGroups(data, factor));
        emit();
      }
      size = { width, height, ratio };
    };

    pad.addEventListener('beginStroke', startStroke);
    pad.addEventListener('endStroke', emit);
    fit();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(canvas);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      pad.removeEventListener('beginStroke', startStroke);
      pad.removeEventListener('endStroke', emit);
      pad.off();
      padRef.current = null;
    };
  }, []);

  const replaceStrokes = (data: PointGroup[]) => {
    const pad = padRef.current;
    const canvas = canvasRef.current;
    if (!pad || !canvas) return;
    pad.fromData(data);
    if (!data.length) pad.clear();
    setStrokes(data.length);
    setRedoable(redoRef.current.length);
    emitSignature(pad, canvas, onChangeRef.current);
  };

  const undo = () => {
    const data = padRef.current?.toData() ?? [];
    const last = data.pop();
    if (!last) return;
    redoRef.current = [...redoRef.current, last];
    replaceStrokes(data);
  };

  const redo = () => {
    const next = redoRef.current[redoRef.current.length - 1];
    if (!next) return;
    redoRef.current = redoRef.current.slice(0, -1);
    replaceStrokes([...(padRef.current?.toData() ?? []), next]);
  };

  const clear = () => {
    redoRef.current = [];
    replaceStrokes([]);
  };

  const actionClass =
    'min-h-11 rounded-md px-3 text-sm font-medium text-navy hover:bg-navy-tint disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={text.signHere(label)}
          className={`block h-44 w-full select-none rounded-md border-2 border-dashed bg-surface ${invalid ? 'border-status-rejected' : 'border-grey'}`}
          style={{
            touchAction: 'none',
            overscrollBehavior: 'contain',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-5 bottom-10 border-t border-grey"
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
        <p className="text-xs text-slate">{text.signHint}</p>
        <div className="flex gap-1">
          <button
            type="button"
            className={actionClass}
            disabled={strokes === 0}
            onClick={undo}
          >
            {text.undo}
          </button>
          <button
            type="button"
            className={actionClass}
            disabled={redoable === 0}
            onClick={redo}
          >
            {text.redo}
          </button>
          <button
            type="button"
            className={actionClass}
            disabled={strokes === 0 && redoable === 0}
            onClick={clear}
          >
            {text.clear}
          </button>
        </div>
      </div>
    </div>
  );
}
