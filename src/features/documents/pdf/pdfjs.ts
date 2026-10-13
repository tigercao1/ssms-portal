import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist';

export type { PDFDocumentProxy, PDFPageProxy };

const assetBase = `${import.meta.env.BASE_URL}pdfjs/`;

let configured: Promise<typeof import('pdfjs-dist')> | null = null;

function pdfjs() {
  configured ??= import('pdfjs-dist').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    return lib;
  });
  return configured;
}

export interface PdfLoad {
  promise: Promise<PDFDocumentProxy>;
  destroy: () => void;
}

/**
 * Loads a PDF from a URL or bytes with the worker, CMaps, standard fonts and
 * wasm decoders served from `/pdfjs/`. Scripting and XFA stay disabled.
 */
export function loadPdf(source: string | Uint8Array): PdfLoad {
  let task: PDFDocumentLoadingTask | null = null;
  let destroyed = false;
  const promise = pdfjs().then((lib) => {
    if (destroyed) throw new Error('PDF load cancelled');
    task = lib.getDocument({
      ...(typeof source === 'string'
        ? { url: source }
        : { data: source.slice() }),
      cMapUrl: `${assetBase}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assetBase}standard_fonts/`,
      wasmUrl: `${assetBase}wasm/`,
      iccUrl: `${assetBase}iccs/`,
      enableXfa: false,
    });
    return task.promise;
  });
  return {
    promise,
    destroy: () => {
      destroyed = true;
      void task?.destroy();
    },
  };
}
