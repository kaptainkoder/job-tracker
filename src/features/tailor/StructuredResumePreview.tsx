import { ArrowLeft, Download, FileCheck2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import Button from '../../shared/ui/Button';
import {
  buildStructuredResumeDocument,
  structuredResumeFilename,
  type ResumeContact,
  type StructuredResume,
} from '../../shared/domain/resume';

interface StructuredResumePreviewProps {
  resume: StructuredResume;
  /** Target role — only used for the download filename. */
  role?: string | null;
  onClose: () => void;
}

const INK = '#1A1D21';
const INK_SOFT = '#5B6470';
const INK_FAINT = '#98A1AD';

// Mirror resumePdf.ts joinContactLine so the on-screen contact line matches the downloaded PDF.
function contactLine(contact: ResumeContact): string {
  return [contact.phone, contact.email, ...contact.links.map((l) => l.label), contact.location]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v))
    .join('  ·  ');
}

function joinDates(start?: string, end?: string): string {
  return [start, end].map((v) => v?.trim()).filter(Boolean).join(' – ');
}

// In-app A4 preview of the StructuredResume. It draws the SAME section model the deterministic PDF
// renderer (createStructuredResumePdf) draws — built once via buildStructuredResumeDocument — so the
// preview and the download stay in lockstep and only confirmed content can ever appear (Wave B · B6.4).
export default function StructuredResumePreview({ resume, role, onClose }: StructuredResumePreviewProps) {
  const doc = useMemo(() => buildStructuredResumeDocument(resume), [resume]);
  const filename = useMemo(() => structuredResumeFilename(resume.contact, role), [resume.contact, role]);
  const contact = useMemo(() => contactLine(resume.contact), [resume.contact]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-canvas p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-heading">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}><ArrowLeft className="h-4 w-4" /> Back</Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-ink-faint">A4 · client-side render · no third-party export</span>
            <Button onClick={() => void import('./resumePdfBrowser').then(({ downloadBrowserStructuredResumePdf }) => downloadBrowserStructuredResumePdf(resume, role))}>
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface-3 p-2 shadow-pop sm:p-5">
          <h2 id="pdf-preview-heading" className="sr-only">A4 résumé preview</h2>
          <article
            data-testid="resume-a4-preview"
            aria-label="A4 résumé document"
            className="mx-auto aspect-[210/297] min-h-fit w-full max-w-[47rem] overflow-visible rounded-sm bg-white px-[9%] py-[7%] font-sans text-[clamp(0.45rem,1.15vw,0.75rem)] leading-[1.4] shadow-pop"
            style={{ color: INK_SOFT }}
          >
            <header className="text-center">
              <h3 className="text-[clamp(0.95rem,2.6vw,1.6rem)] font-bold uppercase tracking-wide" style={{ color: INK }}>{resume.contact.fullName}</h3>
              {resume.contact.title.trim() && <p className="mt-1" style={{ color: INK_SOFT }}>{resume.contact.title}</p>}
              {contact && <p className="mt-1 text-[0.85em]" style={{ color: INK_FAINT }}>{contact}</p>}
            </header>

            {doc.sections.map((section, sectionIndex) => (
              <section key={`${section.kind}-${sectionIndex}`} className="mt-[4%] break-inside-avoid">
                <h4 className="text-center text-[0.95em] font-bold" style={{ color: INK }}>{section.heading}</h4>
                <div className="mt-[1%] border-b" style={{ borderColor: INK_FAINT }} />

                {section.summary && <p className="mt-[2%]" style={{ color: INK_SOFT }}>{section.summary}</p>}

                {section.awards && section.awards.length > 0 && (
                  <div className="mt-[2%] grid grid-cols-2 gap-x-[6%] gap-y-[1.5%]">
                    {section.awards.map((award, i) => (
                      <div key={i}>
                        <p className="font-bold" style={{ color: INK }}>{award.title}</p>
                        {award.detail && <p className="text-[0.9em]" style={{ color: INK_FAINT }}>{award.detail}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {section.experience?.map((exp, i) => (
                  <div key={i} className="mt-[2.5%] break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-[4%]">
                      <span style={{ color: INK }}>{[exp.org, exp.orgDetail ? `(${exp.orgDetail})` : null].filter(Boolean).join('  ')}</span>
                      {exp.location && <span className="shrink-0 text-[0.85em]" style={{ color: INK_FAINT }}>{exp.location}</span>}
                    </div>
                    <div className="flex items-baseline justify-between gap-[4%]">
                      <span className="font-bold" style={{ color: INK_SOFT }}>{exp.title}</span>
                      {joinDates(exp.start, exp.end) && <span className="shrink-0 text-[0.85em]" style={{ color: INK_FAINT }}>{joinDates(exp.start, exp.end)}</span>}
                    </div>
                    {exp.scope && <p className="text-[0.9em] italic" style={{ color: INK_FAINT }}>{exp.scope}</p>}
                    <ul className="mt-[0.5%] space-y-[0.4%]">
                      {exp.bullets.filter((b) => b.trim()).map((bullet, b) => (
                        <li key={b} className="pl-[3%] text-[0.95em] before:-ml-[3%] before:mr-[2%] before:font-bold before:content-['•']" style={{ color: INK_SOFT }}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                ))}

                {section.projects?.map((project, i) => (
                  <div key={i} className="mt-[2.5%] break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-[4%]">
                      <span style={{ color: INK }}>{project.name}</span>
                      {project.location && <span className="shrink-0 text-[0.85em]" style={{ color: INK_FAINT }}>{project.location}</span>}
                    </div>
                    {project.scope && <p className="text-[0.9em] italic" style={{ color: INK_FAINT }}>{project.scope}</p>}
                    <ul className="mt-[0.5%] space-y-[0.4%]">
                      {project.bullets.filter((b) => b.trim()).map((bullet, b) => (
                        <li key={b} className="pl-[3%] text-[0.95em] before:-ml-[3%] before:mr-[2%] before:font-bold before:content-['•']" style={{ color: INK_SOFT }}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                ))}

                {section.education?.map((edu, i) => (
                  <div key={i} className="mt-[2%] break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-[4%]">
                      <span style={{ color: INK }}>{[edu.school, edu.detail ? `- ${edu.detail}` : null].filter(Boolean).join(' ')}</span>
                      {edu.location && <span className="shrink-0 text-[0.85em]" style={{ color: INK_FAINT }}>{edu.location}</span>}
                    </div>
                    <div className="flex items-baseline justify-between gap-[4%]">
                      <span style={{ color: INK_SOFT }}>{edu.degree}</span>
                      {joinDates(edu.start, edu.end) && <span className="shrink-0 text-[0.85em]" style={{ color: INK_FAINT }}>{joinDates(edu.start, edu.end)}</span>}
                    </div>
                  </div>
                ))}

                {section.skills && section.skills.length > 0 && (
                  <div className="mt-[2%] space-y-[1%]">
                    {section.skills.map((group, i) => {
                      const items = group.items.map((s) => s.trim()).filter(Boolean);
                      if (!items.length) return null;
                      return (
                        <p key={i} style={{ color: INK_SOFT }}>
                          {group.label?.trim() && <span className="font-bold" style={{ color: INK }}>{group.label.trim()}: </span>}
                          {items.join('  ·  ')}
                        </p>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </article>
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-ink-faint">
          <FileCheck2 className="h-3.5 w-3.5" /> Rendered from your confirmed structured résumé. Nothing is uploaded to create this PDF.
        </p>
        <p className="sr-only" data-testid="resume-pdf-filename">{filename}</p>
      </div>
    </div>
  );
}
