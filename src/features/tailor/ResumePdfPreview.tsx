import { ArrowLeft, Download, FileCheck2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import type { Application } from '../../shared/types';
import Button from '../../shared/ui/Button';
import { safeResumeFilename, type ResumeDocument } from './resumeDocument';

interface ResumePdfPreviewProps {
  document: ResumeDocument;
  application: Application;
  onClose: () => void;
}

export default function ResumePdfPreview({ document, application, onClose }: ResumePdfPreviewProps) {
  const filename = useMemo(() => safeResumeFilename(application, document.name), [application, document.name]);

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
          <article
            data-testid="resume-a4-preview"
            aria-label="A4 résumé document"
            className="mx-auto aspect-[210/297] min-h-fit w-full max-w-[47rem] overflow-visible rounded-sm bg-white px-[8%] py-[7%] font-sans text-[clamp(0.45rem,1.15vw,0.75rem)] leading-[1.45] text-[#5B6470] shadow-pop"
          >
            <header className="border-b border-[#1A1D21] pb-[3%]">
              <div className="flex items-start justify-between gap-[5%]">
                <div>
                  <h3 className="text-[clamp(1rem,2.8vw,1.8rem)] font-bold leading-tight text-[#1A1D21]">{document.name}</h3>
                  {document.headline && <p className="mt-1 text-[#5B6470]">{document.headline}</p>}
                </div>
                <div className="max-w-[45%] text-right text-[0.9em] leading-relaxed">
                  {(document.contact.length ? document.contact : ['Contact details not provided']).map((line) => <p key={line}>{line}</p>)}
                </div>
              </div>
            </header>
            <p className="mt-[3%] text-[0.85em] text-[#98A1AD]">{document.tailoredFor}</p>
            <div className="mt-[3%] space-y-[3%]">
              {document.sections.map((section, sectionIndex) => (
                <section key={`${section.heading}-${sectionIndex}`} className="break-inside-avoid">
                  <h4 className="mb-[1.5%] text-[0.82em] font-bold uppercase tracking-[0.12em] text-[#98A1AD]">{section.heading}</h4>
                  <div className="space-y-[1.2%]">
                    {section.items.map((item, itemIndex) => item.kind === 'bullet' ? (
                      <p key={itemIndex} className="pl-[3%] before:-ml-[3%] before:mr-[2%] before:font-bold before:text-[#1A1D21] before:content-['•']">{item.text}</p>
                    ) : item.kind === 'subheading' ? (
                      <p key={itemIndex} className="font-bold text-[#1A1D21]">{item.text}</p>
                    ) : (
                      <p key={itemIndex}>{item.text}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {document.skills.length > 0 && (
              <section className="mt-[4%] break-inside-avoid">
                <h4 className="mb-[1.5%] text-[0.82em] font-bold uppercase tracking-[0.12em] text-[#98A1AD]">Core skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {document.skills.map((skill) => <span key={skill} className="rounded bg-[#F1F3F5] px-2 py-1 text-[0.9em]">{skill}</span>)}
                </div>
              </section>
            )}
          </article>
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-ink-faint">
          <FileCheck2 className="h-3.5 w-3.5" /> Rendered from the saved tailored résumé and your confirmed profile. Nothing is uploaded to create this PDF.
        </p>
      </div>
    </div>
  );
}
