// DOM tests never run jsPDF or fetch the bundled font. This stub keeps the browser-only renderer
// (and its `?url` font import + fetch) out of the Node/jsdom bundle while preserving the module
// shape. The bytes are a minimal "%PDF" header so callers can treat them as a real Uint8Array.
import type { StructuredResume } from '../../src/shared/domain/resume';

const STUB_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

export async function browserResumePdfBytes(): Promise<Uint8Array> {
  return STUB_BYTES;
}

export async function downloadBrowserResumePdf(): Promise<void> {}

export async function browserStructuredResumePdfBytes(_resume: StructuredResume): Promise<Uint8Array> {
  return STUB_BYTES;
}

export async function browserStructuredResumeLayoutContract() {
  return {
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginXmm: 12,
    marginTopMm: 14,
    marginBottomMm: 12,
    bulletIndentMm: 4.5,
    bulletAvailableWidthMm: 181.5,
    bulletFontSizePt: 8.8,
    preferredBulletFillRatio: { min: 0.75, max: 1 },
    scale: 1,
  };
}

export async function browserAnalyzeStructuredResumeBulletWidths(candidates: readonly string[]) {
  return candidates.map((text) => ({
    text: text.trim(),
    availableWidthMm: 181.5,
    measuredWidthMm: 150,
    fillRatio: 0.83,
    overflowMm: 0,
    fitsSingleLine: true,
  }));
}

export async function browserAnalyzeStructuredResumeLayout(_resume: StructuredResume) {
  return globalThis.__STRUCTURED_LAYOUT_DIAGNOSTICS__ ?? {
    pageCount: 1,
    contentBottomMm: 250,
    usableBottomMm: 285,
    utilization: 0.85,
    scale: 1,
    minRelevantFontSizePt: 7.8,
    bulletFontSizePt: 8.8,
    bulletAvailableWidthMm: 181.5,
    bullets: [],
    overflows: [],
    fitsSinglePage: true,
    hasPageOverflow: false,
    hasClipping: false,
    isValid: true,
  };
}

export async function downloadBrowserStructuredResumePdf(): Promise<void> {}
