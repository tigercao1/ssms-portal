export interface SamplePdfPage {
  width: number;
  height: number;
  rotate?: 0 | 90 | 180 | 270;
  cropBox?: [number, number, number, number];
  lines?: string[];
}

function escapePdfText(s: string): string {
  return s.replace(/[\\()]/g, (c) => `\\${c}`);
}

function pageContent(page: SamplePdfPage, index: number): string {
  const lines = page.lines ?? [`Sample document - page ${index + 1}`];
  const ops = ['0.85 0.88 0.93 RG 1 w'];
  ops.push(`36 36 ${page.width - 72} ${page.height - 72} re S`);
  ops.push('BT /F1 18 Tf 0.1 0.15 0.3 rg');
  ops.push(`72 ${page.height - 96} Td`);
  lines.forEach((line, i) => {
    if (i > 0) ops.push('0 -28 Td /F1 11 Tf');
    ops.push(`(${escapePdfText(line)}) Tj`);
  });
  ops.push('ET');
  for (let y = page.height - 200; y > 120; y -= 22) {
    ops.push(`0.8 0.8 0.8 RG 72 ${y} m ${page.width - 72} ${y} l S`);
  }
  return ops.join('\n');
}

/**
 * Builds a small valid PDF (Helvetica text, no external resources) for mocks,
 * tests and screenshots.
 */
export function buildSamplePdf(
  pages: SamplePdfPage[],
): Uint8Array<ArrayBuffer> {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((page, i) => {
    const id = pageIds[i]!;
    const content = pageContent(page, i);
    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}]` +
      (page.cropBox ? ` /CropBox [${page.cropBox.join(' ')}]` : '') +
      ` /Rotate ${page.rotate ?? 0} /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objects[id + 1] =
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
