// Pure helpers for preserving external PDF link annotations during browser-side extraction.
// Kept separate from resumePdfText.ts so the behavior can be tested without loading pdf.js or its
// browser worker.

export const PDF_LINK_REVIEW_WARNING =
  'Some PDF link annotations could not be read. Manually verify LinkedIn and other contact links before saving.';

export interface PdfLinkAnnotationLike {
  url?: unknown;
  unsafeUrl?: unknown;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function extractSafePdfLinkUrls(annotations: unknown): string[] {
  if (!Array.isArray(annotations)) return [];
  const urls = new Set<string>();
  for (const annotation of annotations) {
    if (!annotation || typeof annotation !== 'object') continue;
    const candidate = annotation as PdfLinkAnnotationLike;
    const url = safeHttpUrl(candidate.url) ?? safeHttpUrl(candidate.unsafeUrl);
    if (url) urls.add(url);
  }
  return [...urls];
}

export function appendPdfLinkAnnotations(text: string, urls: readonly string[]): string {
  const unique = [...new Set(urls)];
  if (unique.length === 0) return text.trim();
  return [
    text.trim(),
    'PDF link annotations (preserve these URLs in contact.links):',
    ...unique.map((url) => `- ${url}`),
  ]
    .filter(Boolean)
    .join('\n\n');
}
