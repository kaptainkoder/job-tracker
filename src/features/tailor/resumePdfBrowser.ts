import interFontUrl from '../../assets/InterVariable.ttf?url';
import type { ResumeDocument } from './resumeDocument';
import { downloadResumePdf, resumePdfBytes } from './resumePdf';

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
