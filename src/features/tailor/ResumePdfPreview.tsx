import { ArrowLeft, Download, FileCheck2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Application } from '../../shared/types';
import Button from '../../shared/ui/Button';
import { safeResumeFilename, type ResumeDocument } from './resumeDocument';

interface ResumePdfPreviewProps {
  document: ResumeDocument;
  application: Application;
  onClose: () => void;
}

export default function ResumePdfPreview({ document, application, onClose }: ResumePdfPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const filename = useMemo(() => safeResumeFilename(application, document.name), [application, document.name]);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    void import('./resumePdfBrowser').then(({ browserResumePdfBytes }) => browserResumePdfBytes(document)).then((bytes) => {
      if (!active) return;
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      url = URL.createObjectURL(blob);
      setPdfUrl(url);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [document]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-canvas p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-heading">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}><ArrowLeft className="h-4 w-4" /> Back to tailor kit</Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-ink-faint">A4 · client-side render · no third-party export</span>
            <Button onClick={() => void import('./resumePdfBrowser').then(({ downloadBrowserResumePdf }) => downloadBrowserResumePdf(document, filename))}><Download className="h-4 w-4" /> Download PDF</Button>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface-3 p-2 shadow-pop sm:p-5">
          <h2 id="pdf-preview-heading" className="sr-only">A4 résumé preview</h2>
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              title="A4 résumé preview"
              className="mx-auto block aspect-[210/297] w-full max-w-[47rem] rounded-sm border-0 bg-white shadow-pop"
            />
          ) : (
            <div className="mx-auto flex aspect-[210/297] w-full max-w-[47rem] items-center justify-center rounded-sm bg-white text-sm text-ink-soft">Preparing preview…</div>
          )}
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-ink-faint">
          <FileCheck2 className="h-3.5 w-3.5" /> Rendered from the saved tailored résumé and your confirmed profile. Nothing is uploaded to create this PDF.
        </p>
      </div>
    </div>
  );
}
