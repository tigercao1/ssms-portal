export type Matrix = [number, number, number, number, number, number];

export interface PdfViewport {
  width: number;
  height: number;
  transform: number[];
}

export interface PdfRenderTask {
  promise: Promise<unknown>;
  cancel: () => void;
}

export interface PdfPage {
  pageNumber: number;
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: {
    canvas: HTMLCanvasElement;
    viewport: PdfViewport;
  }) => PdfRenderTask;
}

export interface PdfDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
}
