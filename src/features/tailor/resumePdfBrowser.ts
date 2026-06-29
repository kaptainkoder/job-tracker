import interFontUrl from '../../assets/InterVariable.ttf?url';
import type { ResumeDocument } from './resumeDocument';
import type { StructuredResume } from '../../shared/domain/resume';
import {
  downloadResumePdf,
  downloadStructuredResumePdf,
  resumePdfBytes,
  structuredResumePdfBytes,
} from './resumePdf';

let interFontPromise: Promise<string> | null = null;

async function loadInterFontBase64(): Promise<string> {
  if (!interFontPromise) {
    interFontPromise = fetch(interFontUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load the bundled Inter font (${response.status}).`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return btoa(binary);
      });
  }
  return interFontPromise;
}

export async function browserResumePdfBytes(document: ResumeDocument): Promise<Uint8Array> {
  return resumePdfBytes(document, await loadInterFontBase64());
}

export async function downloadBrowserResumePdf(document: ResumeDocument, filename: string): Promise<void> {
  downloadResumePdf(document, filename, await loadInterFontBase64());
}

// Structured path (Wave B · B6.4). The deterministic StructuredResume renderer + the in-app HTML
// preview consume the same StructuredResume, so download and preview never drift.
export async function browserStructuredResumePdfBytes(resume: StructuredResume): Promise<Uint8Array> {
  return structuredResumePdfBytes(resume, await loadInterFontBase64());
}

export async function downloadBrowserStructuredResumePdf(
  resume: StructuredResume,
  role: string | null | undefined,
): Promise<void> {
  downloadStructuredResumePdf(resume, role, await loadInterFontBase64());
}
