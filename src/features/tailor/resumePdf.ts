import { jsPDF } from 'jspdf';
import type { ResumeDocument } from './resumeDocument';

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
