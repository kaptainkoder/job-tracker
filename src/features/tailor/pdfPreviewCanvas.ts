// Browser-only PDF bytes → <canvas>, for the in-app résumé preview (Wave B · B6.4-R). Rendering the
// ACTUAL generated PDF (not a re-implemented HTML frame) is what makes the preview glyph-for-glyph
// identical to the downloaded file. pdf.js is heavy and needs a worker, so — mirroring
// resumePdfText.ts — the worker is emitted via `?url` and the library is dynamically imported so the
// large bundle only loads when a preview actually opens. Isolated in its own module so the DOM-test
// harness can stub it (the `?url` worker import must never enter the Node/jsdom test bundle).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export interface RenderedPdf {
  pages: number;
}

// Render the first page of `bytes` into `canvas` at a crisp device scale. Returns the page count so
// the caller can surface multi-page spill (the résumé renderer targets one page). Throws on an
// unreadable PDF or a missing 2D context so the caller can show an honest error.
export async function renderPdfToCanvas(
  bytes: Uint8Array,
  canvas: HTMLCanvasElement,
  scale = 2,
): Promise<RenderedPdf> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // A copy: pdf.js transfers/detaches the buffer it parses, and the caller keeps the bytes for download.
  const pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale });
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable.');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    context.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return { pages: pdf.numPages };
  } finally {
    await pdf.destroy();
  }
}
