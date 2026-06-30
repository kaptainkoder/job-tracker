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

export async function downloadBrowserStructuredResumePdf(): Promise<void> {}
