// ResumeReviewPage DOM tests never parse a PDF. This keeps the browser-only pdf.js worker out of
// the Node/jsdom bundle while preserving the module shape.
export async function extractPdfText() {
  return { text: 'stub résumé', pageCount: 1, linkUrls: [], warnings: [] };
}
