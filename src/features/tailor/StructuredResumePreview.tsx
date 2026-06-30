import { ArrowLeft, Download, FileCheck2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../shared/ui/Button';
import { structuredResumeFilename, type StructuredResume } from '../../shared/domain/resume';

interface StructuredResumePreviewProps {
  resume: StructuredResume;
  /** Target role — only used for the download filename. */
  role?: string | null;
  onClose: () => void;
}

// Save already-generated PDF bytes to disk. No import()/fetch() — the bytes are in hand, so the
// download CLICK makes zero network requests (Wave B · B6.4-R, recheck item 3).
function savePdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// In-app A4 preview that renders the ACTUAL generated PDF bytes to a <canvas> via pdfjs-dist, so the
// on-screen preview is glyph-for-glyph identical to the downloaded file (Wave B · B6.4-R) — closing
// the old drift where a hand-built HTML frame clipped and never matched the jsPDF output. The
// renderer + bundled font load when the preview OPENS (needed to draw the canvas); the bytes are
// held in a ref, so the Download button re-saves them with no network on the click.
export default function StructuredResumePreview({ resume, role, onClose }: StructuredResumePreviewProps) {
  const filename = useMemo(() => structuredResumeFilename(resume.contact, role), [resume.contact, role]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Generate the PDF bytes and paint page 1 onto the canvas when the preview opens.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    bytesRef.current = null;
    void (async () => {
      try {
        const { browserStructuredResumePdfBytes } = await import('./resumePdfBrowser');
        const bytes = await browserStructuredResumePdfBytes(resume);
        if (cancelled) return;
        bytesRef.current = bytes;
        const canvas = canvasRef.current;
        if (canvas) {
          const { renderPdfToCanvas } = await import('./pdfPreviewCanvas');
          await renderPdfToCanvas(bytes, canvas);
        }
        if (!cancelled) setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Could not render the preview.');
      }
    })();
    return () => { cancelled = true; };
  }, [resume]);

  const onDownload = () => {
    if (bytesRef.current) savePdfBytes(bytesRef.current, filename);
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-canvas p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-heading">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}><ArrowLeft className="h-4 w-4" /> Back</Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-ink-faint">A4 · client-side render · no third-party export</span>
            <Button disabled={status !== 'ready'} onClick={onDownload}>
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface-3 p-2 shadow-pop sm:p-5">
          <h2 id="pdf-preview-heading" className="sr-only">A4 résumé preview</h2>
          <div
            data-testid="resume-a4-preview"
            aria-label="A4 résumé document"
            className="relative mx-auto aspect-[210/297] w-full max-w-[47rem] overflow-hidden rounded-sm bg-white shadow-pop"
          >
            <canvas ref={canvasRef} aria-label="Rendered résumé page" className="block h-auto w-full" />
            {status !== 'ready' && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-6 text-center text-sm text-ink-soft">
                {status === 'loading' ? 'Preparing preview…' : (error ?? 'Could not render the preview.')}
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-ink-faint">
          <FileCheck2 className="h-3.5 w-3.5" /> Rendered from your confirmed structured résumé. Nothing is uploaded to create this PDF.
        </p>
        <p className="sr-only" data-testid="resume-pdf-filename">{filename}</p>
      </div>
    </div>
  );
}
