// Browser-only PDF → plain text, for the one-time résumé parse (Wave B · B6.3). The extracted text
// is what gets sent to the parse-resume LLM action — pdf.js runs entirely in the browser, so the
// raw PDF bytes never leave the device; only the text the owner is about to review is sent (audited,
// no-log). pdf.js is heavy, so callers dynamic-import THIS module and we only touch the worker on use.

// `?url` (typed via vite/client) emits the worker as a static asset and gives us its URL; pdf.js
// needs a worker to parse off the main thread. We import the lib lazily inside the function so the
// large pdf.js bundle is only fetched when a résumé is actually parsed.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  PDF_LINK_REVIEW_WARNING,
  appendPdfLinkAnnotations,
  extractSafePdfLinkUrls,
} from './resumePdfLinks';

export interface ExtractedPdfText {
  text: string;
  pageCount: number;
  linkUrls: string[];
  warnings: string[];
}

// Extract text from a PDF's bytes. Joins page text with blank lines and collapses runs of spaces so
// the parse prompt sees clean lines. Throws on an unreadable/encrypted PDF so the caller can show an
// honest error rather than send empty text to the model.
export async function extractPdfText(data: ArrayBuffer): Promise<ExtractedPdfText> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // A copy: pdf.js transfers/detaches the buffer it parses, and callers may reuse the original.
  const pdf = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  try {
    const pages: string[] = [];
    const linkUrls = new Set<string>();
    let annotationReadFailed = false;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
      if (line) pages.push(line);

      try {
        const annotations = await page.getAnnotations({ intent: 'display' });
        for (const url of extractSafePdfLinkUrls(annotations)) linkUrls.add(url);
      } catch {
        // Text extraction is still useful. Surface the annotation gap explicitly in the review UI
        // instead of silently pretending contact/profile links were recovered.
        annotationReadFailed = true;
      }
    }
    const urls = [...linkUrls];
    return {
      text: appendPdfLinkAnnotations(pages.join('\n\n'), urls),
      pageCount: pdf.numPages,
      linkUrls: urls,
      warnings: annotationReadFailed ? [PDF_LINK_REVIEW_WARNING] : [],
    };
  } finally {
    await pdf.destroy();
  }
}
