import {
  GlobalWorkerOptions,
  getDocument,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PdfDocument } from './types';

const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export function openPdf(bytes: Uint8Array): {
  promise: Promise<PdfDocument>;
  destroy: () => void;
} {
  const task = getDocument({
    data: bytes.slice(),
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    useWasm: false,
    enableXfa: false,
  });
  return {
    promise: task.promise as unknown as Promise<PdfDocument>,
    destroy: () => void task.destroy(),
  };
}
