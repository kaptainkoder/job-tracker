import { jsPDF } from 'jspdf';
import type { ResumeDocument } from './resumeDocument';
import {
  buildStructuredResumeDocument,
  structuredResumeFilename,
  type ResumeContact,
  type StructuredResume,
} from '../../shared/domain/resume';

const PAGE = { width: 210, height: 297, marginX: 18, marginTop: 18, marginBottom: 16 };
const INK = '#1A1D21';
const INK_SOFT = '#5B6470';
const INK_FAINT = '#98A1AD';
const SURFACE_3 = '#F1F3F5';

export function createResumePdf(document: ResumeDocument, interFontBase64?: string): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const fontFamily = interFontBase64 ? 'Inter' : 'helvetica';
  if (interFontBase64) {
    pdf.addFileToVFS('InterVariable.ttf', interFontBase64);
    pdf.addFont('InterVariable.ttf', 'Inter', 'normal');
    pdf.addFont('InterVariable.ttf', 'Inter', 'bold');
  }
  const contentWidth = PAGE.width - PAGE.marginX * 2;
  let y = PAGE.marginTop;

  const addPage = () => { pdf.addPage('a4', 'portrait'); y = PAGE.marginTop; };
  const ensureSpace = (height: number) => {
    if (y + height > PAGE.height - PAGE.marginBottom) addPage();
  };
  const writeWrapped = (text: string, options: { size?: number; color?: string; bold?: boolean; indent?: number; lineHeight?: number } = {}) => {
    const size = options.size ?? 9.4;
    const indent = options.indent ?? 0;
    const lineHeight = options.lineHeight ?? 4.5;
    pdf.setFont(fontFamily, options.bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(options.color ?? INK_SOFT);
    const lines = pdf.splitTextToSize(text, contentWidth - indent) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      pdf.text(line, PAGE.marginX + indent, y);
      y += lineHeight;
    }
  };

  pdf.setProperties({ title: `${document.name} — tailored résumé`, subject: document.tailoredFor, creator: 'Job Tracker' });
  pdf.setFont(fontFamily, 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(INK);
  pdf.text(document.name, PAGE.marginX, y + 2);
  pdf.setFont(fontFamily, 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(INK_SOFT);
  if (document.headline) pdf.text(document.headline, PAGE.marginX, y + 8);
  const contactLines = document.contact.length ? document.contact : ['Contact details not provided'];
  contactLines.forEach((line, index) => pdf.text(line, PAGE.width - PAGE.marginX, y + index * 4, { align: 'right' }));
  y += Math.max(17, contactLines.length * 4 + 4);
  pdf.setDrawColor(INK);
  pdf.setLineWidth(0.45);
  pdf.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
  y += 7;
  pdf.setFontSize(8.2);
  pdf.setTextColor(INK_FAINT);
  pdf.text(document.tailoredFor, PAGE.marginX, y);
  y += 7;

  for (const section of document.sections) {
    ensureSpace(12);
    pdf.setFont(fontFamily, 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(INK_FAINT);
    pdf.setCharSpace(0.35);
    pdf.text(section.heading.toUpperCase(), PAGE.marginX, y);
    pdf.setCharSpace(0);
    y += 5;
    for (const item of section.items) {
      if (item.kind === 'subheading') {
        ensureSpace(6);
        writeWrapped(item.text, { size: 9.5, color: INK, bold: true, lineHeight: 4.5 });
        y += 1;
      } else if (item.kind === 'bullet') {
        ensureSpace(5);
        pdf.setFont(fontFamily, 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(INK);
        pdf.text('•', PAGE.marginX + 0.5, y);
        writeWrapped(item.text, { indent: 5, lineHeight: 4.5 });
        y += 1.2;
      } else {
        writeWrapped(item.text, { lineHeight: 4.6 });
        y += 1.5;
      }
    }
    y += 3;
  }

  if (document.skills.length) {
    ensureSpace(18);
    pdf.setFont(fontFamily, 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(INK_FAINT);
    pdf.setCharSpace(0.35);
    pdf.text('CORE SKILLS', PAGE.marginX, y);
    pdf.setCharSpace(0);
    y += 5;
    let x = PAGE.marginX;
    for (const skill of document.skills) {
      pdf.setFont(fontFamily, 'normal');
      pdf.setFontSize(8.3);
      const width = pdf.getTextWidth(skill) + 6;
      if (x + width > PAGE.width - PAGE.marginX) {
        x = PAGE.marginX;
        y += 7;
        ensureSpace(7);
      }
      pdf.setFillColor(SURFACE_3);
      pdf.roundedRect(x, y - 3.7, width, 5.6, 1.2, 1.2, 'F');
      pdf.setTextColor(INK_SOFT);
      pdf.text(skill, x + 3, y);
      x += width + 2;
    }
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont(fontFamily, 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(INK_FAINT);
    pdf.text(`${page} / ${pageCount}`, PAGE.width - PAGE.marginX, PAGE.height - 8, { align: 'right' });
  }
  return pdf;
}

export function resumePdfBytes(document: ResumeDocument, interFontBase64?: string): Uint8Array {
  return new Uint8Array(createResumePdf(document, interFontBase64).output('arraybuffer'));
}

export function downloadResumePdf(document: ResumeDocument, filename: string, interFontBase64?: string): void {
  const blob = new Blob([resumePdfBytes(document, interFontBase64) as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// --- Structured renderer (Wave B · B6) ----------------------------------------------------------
// Deterministic renderer for the StructuredResume model, reproducing Karan's base-résumé template:
// centered header + contact line, centered section headings with a hairline rule, experience/
// project entries with org/role on the left and location/dates right-aligned, an awards grid, an
// education list, and a skills line (label: a · b · c). Layout is fully deterministic — no LLM —
// which is what guarantees format fidelity and that only confirmed content is drawn (AC #3/#4/#5).

const DOT = '  •  ';

function joinContactLine(contact: ResumeContact): string {
  return [
    contact.phone,
    contact.email,
    ...contact.links.map((link) => link.label),
    contact.location,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(DOT);
}

export function createStructuredResumePdf(resume: StructuredResume, interFontBase64?: string): jsPDF {
  const doc = buildStructuredResumeDocument(resume);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const fontFamily = interFontBase64 ? 'Inter' : 'helvetica';
  if (interFontBase64) {
    pdf.addFileToVFS('InterVariable.ttf', interFontBase64);
    pdf.addFont('InterVariable.ttf', 'Inter', 'normal');
    pdf.addFont('InterVariable.ttf', 'Inter', 'bold');
  }
  const contentWidth = PAGE.width - PAGE.marginX * 2;
  const centerX = PAGE.width / 2;
  const rightX = PAGE.width - PAGE.marginX;
  let y = PAGE.marginTop;

  const addPage = () => { pdf.addPage('a4', 'portrait'); y = PAGE.marginTop; };
  const ensureSpace = (height: number) => {
    if (y + height > PAGE.height - PAGE.marginBottom) addPage();
  };

  // A left-aligned block of text that wraps within an optional right boundary, advancing y.
  const writeWrapped = (
    text: string,
    options: { size?: number; color?: string; bold?: boolean; indent?: number; lineHeight?: number; maxWidth?: number } = {},
  ) => {
    const size = options.size ?? 9.4;
    const indent = options.indent ?? 0;
    const lineHeight = options.lineHeight ?? 4.6;
    pdf.setFont(fontFamily, options.bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(options.color ?? INK_SOFT);
    const width = (options.maxWidth ?? contentWidth) - indent;
    const lines = pdf.splitTextToSize(text, width) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      pdf.text(line, PAGE.marginX + indent, y);
      y += lineHeight;
    }
  };

  // A header row with left text (possibly bold) and an optional right-aligned meta string on the
  // SAME baseline. The left text is clipped to leave room for the right text.
  const writeRow = (
    left: string,
    right: string | undefined,
    options: { leftSize?: number; leftColor?: string; leftBold?: boolean; rightSize?: number; rightColor?: string } = {},
  ) => {
    const leftSize = options.leftSize ?? 9.6;
    const lineHeight = leftSize * 0.5 + 0.4;
    ensureSpace(lineHeight);
    let rightWidth = 0;
    if (right) {
      pdf.setFont(fontFamily, 'normal');
      pdf.setFontSize(options.rightSize ?? 8.4);
      rightWidth = pdf.getTextWidth(right) + 3;
      pdf.setTextColor(options.rightColor ?? INK_FAINT);
      pdf.text(right, rightX, y, { align: 'right' });
    }
    pdf.setFont(fontFamily, options.leftBold ? 'bold' : 'normal');
    pdf.setFontSize(leftSize);
    pdf.setTextColor(options.leftColor ?? INK);
    const leftLines = pdf.splitTextToSize(left, contentWidth - rightWidth) as string[];
    pdf.text(leftLines[0] ?? '', PAGE.marginX, y);
    y += lineHeight;
  };

  const sectionHeading = (heading: string) => {
    ensureSpace(11);
    y += 1.5;
    pdf.setFont(fontFamily, 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(INK);
    pdf.text(heading, centerX, y, { align: 'center' });
    y += 2;
    pdf.setDrawColor(INK_FAINT);
    pdf.setLineWidth(0.2);
    pdf.line(PAGE.marginX, y, rightX, y);
    y += 5;
  };

  pdf.setProperties({
    title: `${resume.contact.fullName} — résumé`,
    subject: resume.contact.title,
    creator: 'Job Tracker',
  });

  // Header — centered name, title, contact line.
  pdf.setFont(fontFamily, 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(INK);
  pdf.text(resume.contact.fullName.toUpperCase(), centerX, y + 2, { align: 'center' });
  y += 7;
  if (resume.contact.title.trim()) {
    pdf.setFont(fontFamily, 'normal');
    pdf.setFontSize(9.6);
    pdf.setTextColor(INK_SOFT);
    pdf.text(resume.contact.title, centerX, y, { align: 'center' });
    y += 5;
  }
  const contactLine = joinContactLine(resume.contact);
  if (contactLine) {
    pdf.setFont(fontFamily, 'normal');
    pdf.setFontSize(8.4);
    pdf.setTextColor(INK_FAINT);
    pdf.text(contactLine, centerX, y, { align: 'center' });
    y += 4;
  }

  for (const section of doc.sections) {
    sectionHeading(section.heading);

    if (section.summary) {
      writeWrapped(section.summary, { size: 9, color: INK_SOFT, lineHeight: 4.6 });
      y += 2;
    }

    if (section.awards?.length) {
      // Two-column grid; each cell carries a title and an optional soft detail line.
      const gutter = 6;
      const colWidth = (contentWidth - gutter) / 2;
      const colX = [PAGE.marginX, PAGE.marginX + colWidth + gutter];
      for (let i = 0; i < section.awards.length; i += 2) {
        const pair = [section.awards[i], section.awards[i + 1]];
        const cellHeights = pair.map((award) => {
          if (!award) return 0;
          let h = 4.6;
          if (award.detail) h += 4.2;
          return h;
        });
        const rowHeight = Math.max(...cellHeights, 4.6);
        ensureSpace(rowHeight + 1);
        const rowY = y;
        pair.forEach((award, col) => {
          if (!award) return;
          let cy = rowY;
          pdf.setFont(fontFamily, 'bold');
          pdf.setFontSize(8.6);
          pdf.setTextColor(INK);
          const titleLines = pdf.splitTextToSize(award.title, colWidth) as string[];
          pdf.text(titleLines[0] ?? '', colX[col], cy);
          cy += 4.6;
          if (award.detail) {
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(7.8);
            pdf.setTextColor(INK_FAINT);
            const detailLines = pdf.splitTextToSize(award.detail, colWidth) as string[];
            pdf.text(detailLines[0] ?? '', colX[col], cy);
          }
        });
        y = rowY + rowHeight + 1.6;
      }
      y += 1;
    }

    for (const exp of section.experience ?? []) {
      const orgLeft = [exp.org, exp.orgDetail ? `(${exp.orgDetail})` : null].filter(Boolean).join('  ');
      writeRow(orgLeft, exp.location, { leftSize: 9.6, leftColor: INK, leftBold: false });
      const dates = [exp.start, exp.end].map((v) => v?.trim()).filter(Boolean).join(' - ');
      writeRow(exp.title, dates || undefined, { leftSize: 9.2, leftColor: INK_SOFT, leftBold: true });
      if (exp.scope) {
        writeWrapped(exp.scope, { size: 8.6, color: INK_FAINT, lineHeight: 4.2 });
      }
      y += 0.5;
      for (const bullet of exp.bullets.filter((b) => b.trim())) {
        ensureSpace(5);
        pdf.setFont(fontFamily, 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(INK_SOFT);
        pdf.text('•', PAGE.marginX + 0.5, y);
        writeWrapped(bullet, { indent: 4.5, lineHeight: 4.4, size: 8.8 });
        y += 0.8;
      }
      y += 2.5;
    }

    for (const project of section.projects ?? []) {
      writeRow(project.name, project.location, { leftSize: 9.4, leftColor: INK, leftBold: false });
      if (project.scope) {
        writeWrapped(project.scope, { size: 8.6, color: INK_FAINT, lineHeight: 4.2 });
      }
      y += 0.5;
      for (const bullet of project.bullets.filter((b) => b.trim())) {
        ensureSpace(5);
        pdf.setFont(fontFamily, 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(INK_SOFT);
        pdf.text('•', PAGE.marginX + 0.5, y);
        writeWrapped(bullet, { indent: 4.5, lineHeight: 4.4, size: 8.8 });
        y += 0.8;
      }
      y += 2.5;
    }

    for (const edu of section.education ?? []) {
      const schoolLeft = [edu.school, edu.detail ? `- ${edu.detail}` : null].filter(Boolean).join(' ');
      writeRow(schoolLeft, edu.location, { leftSize: 9.4, leftColor: INK, leftBold: false });
      const dates = [edu.start, edu.end].map((v) => v?.trim()).filter(Boolean).join(' - ');
      writeRow(edu.degree, dates || undefined, { leftSize: 8.8, leftColor: INK_SOFT, leftBold: false });
      y += 2;
    }

    if (section.skills?.length) {
      for (const group of section.skills) {
        const items = group.items.map((s) => s.trim()).filter(Boolean);
        if (!items.length) continue;
        const prefix = group.label?.trim() ? `${group.label.trim()}: ` : '';
        writeWrapped(`${prefix}${items.join('  ·  ')}`, { size: 8.8, color: INK_SOFT, lineHeight: 4.5 });
        y += 1;
      }
    }
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont(fontFamily, 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(INK_FAINT);
    pdf.text(`${page} / ${pageCount}`, rightX, PAGE.height - 8, { align: 'right' });
  }
  return pdf;
}

export function structuredResumePdfBytes(resume: StructuredResume, interFontBase64?: string): Uint8Array {
  return new Uint8Array(createStructuredResumePdf(resume, interFontBase64).output('arraybuffer'));
}

export function downloadStructuredResumePdf(
  resume: StructuredResume,
  role: string | null | undefined,
  interFontBase64?: string,
): void {
  const filename = structuredResumeFilename(resume.contact, role);
  const blob = new Blob([structuredResumePdfBytes(resume, interFontBase64) as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
