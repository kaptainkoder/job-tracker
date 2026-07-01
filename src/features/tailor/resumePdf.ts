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

// A run of text that is either normal or bold — the unit of the run-based layout that lets the
// renderer bold key metrics inside an otherwise-normal bullet (Wave B · B6.4-R).
export interface TextRun {
  text: string;
  bold: boolean;
}

// Metric tokens to emphasise: $15M, 41.25%, 5x, 700K, 10+, 1.1M, 1.8x, 85% … (a number, an optional
// leading $, an optional %/x/k/m/bn unit, an optional trailing +). Pure; exported for unit testing.
const METRIC_TOKEN = /\$?\d[\d.,]*(?:%|x|k|m|bn)?\+?/gi;

export function splitMetricRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let last = 0;
  METRIC_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = METRIC_TOKEN.exec(text)) !== null) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index), bold: false });
    runs.push({ text: match[0], bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false });
  return runs.length ? runs : [{ text, bold: false }];
}

// Break at whitespace that FOLLOWS a clause delimiter (comma / semicolon / colon / em-dash / a
// sentence period), keeping the delimiter on the preceding clause. The look-behind + `\s` means a
// decimal ("41.25%") or a "$15M in" never splits — only real clause breaks do.
const CLAUSE_BREAK = /(?<=[,;:—])\s+|(?<=\.)\s+/;
// Trailing clause punctuation to trim when a clause becomes its own bullet (keep a terminal period).
const TRAILING_CLAUSE_PUNCT = /[\s,;:—]+$/;

// Present one bullet as clean full-width single-line bullet(s) at a UNIFORM font size — never wrapped
// and never per-bullet shrunk (the two things that made bullets look ragged / mismatched). When the
// bullet is too wide for one line at the uniform size, it is split at clause boundaries into as many
// bullets as needed, each greedily packed so every line looks full. `measure` returns the rendered
// width of a candidate line at the uniform bullet size and `avail` is the usable line width. A single
// clause still wider than `avail` is emitted alone (the caller floor-shrinks only that rare line so it
// never clips). Pure + injectable `measure` so the packing is unit-testable without jsPDF.
export function splitBulletForWidth(
  text: string,
  avail: number,
  measure: (line: string) => number,
): string[] {
  const whole = text.trim();
  if (!whole || measure(whole) <= avail) return [whole];
  const clauses = whole.split(CLAUSE_BREAK).map((c) => c.trim()).filter(Boolean);
  if (clauses.length <= 1) return [whole]; // nothing to split on — caller shrinks this one line

  const clean = (line: string): string => {
    const trimmed = line.replace(TRAILING_CLAUSE_PUNCT, '');
    return trimmed.replace(/^([a-z])/, (m) => m.toUpperCase());
  };
  const lines: string[] = [];
  let current = '';
  for (const clause of clauses) {
    const candidate = current ? `${current} ${clause}` : clause;
    if (current && measure(candidate) > avail) {
      lines.push(clean(current));
      current = clause;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(clean(current));
  return lines;
}

// Base (scale = 1) point sizes. The renderer multiplies these by a density `scale` chosen to land
// the whole résumé on one A4 page (down to FLOOR), then renders once at that scale.
const STRUCT = { marginX: 16, marginTop: 14, marginBottom: 12 } as const;
const STRUCT_FLOOR = 0.6;
const STRUCT_SIZE = {
  name: 18, title: 9.6, contact: 8.4, heading: 9.5, summary: 9,
  awardTitle: 8.6, awardDetail: 7.8, org: 9.6, role: 9.2, scope: 8.6,
  bullet: 8.8, proj: 9.4, school: 9.4, degree: 8.8, skills: 8.8,
} as const;

// Width of a sequence of runs at a fixed font size (bold runs measured with the bold face).
function measureRunWidth(pdf: jsPDF, runs: TextRun[], fontFamily: string, size: number): number {
  let width = 0;
  for (const run of runs) {
    pdf.setFont(fontFamily, run.bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    width += pdf.getTextWidth(run.text);
  }
  return width;
}

// Draw a sequence of runs on ONE baseline at a fixed size (no wrapping); bold runs use boldColor.
function drawRunLine(
  pdf: jsPDF, runs: TextRun[], x: number, y: number, fontFamily: string,
  size: number, normalColor: string, boldColor: string,
): void {
  let cx = x;
  for (const run of runs) {
    pdf.setFont(fontFamily, run.bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(run.bold ? boldColor : normalColor);
    pdf.text(run.text, cx, y);
    cx += pdf.getTextWidth(run.text);
  }
}

// Draw the entire structured résumé into `pdf` at a density `scale`. Returns the final y (the
// absolute bottom of the content). When `paginate` is false the renderer never breaks the page —
// the caller uses the returned height purely to MEASURE whether this scale fits on one page; when
// true it breaks normally (the >1-page fallback for résumés too large even at FLOOR). Both passes
// run the identical code, so the chosen scale that measured as fitting renders on exactly one page.
function renderStructuredInto(
  pdf: jsPDF,
  doc: ReturnType<typeof buildStructuredResumeDocument>,
  scale: number,
  fontFamily: string,
  paginate: boolean,
): number {
  const { marginX: MX, marginTop: MT, marginBottom: MB } = STRUCT;
  const contentWidth = PAGE.width - MX * 2;
  const centerX = PAGE.width / 2;
  const rightX = PAGE.width - MX;
  const sz = (base: number) => base * scale;
  let y = MT;

  const addPage = () => { pdf.addPage('a4', 'portrait'); y = MT; };
  const ensureSpace = (height: number) => {
    if (paginate && y + height > PAGE.height - MB) addPage();
  };

  // Wrapped paragraph (summary, scope) at a scaled size.
  const writeWrapped = (
    text: string,
    options: { size: number; color: string; bold?: boolean; indent?: number; lineHeight: number },
  ) => {
    const indent = options.indent ?? 0;
    pdf.setFont(fontFamily, options.bold ? 'bold' : 'normal');
    pdf.setFontSize(options.size);
    pdf.setTextColor(options.color);
    const lines = pdf.splitTextToSize(text, contentWidth - indent) as string[];
    for (const line of lines) {
      ensureSpace(options.lineHeight);
      pdf.text(line, MX + indent, y);
      y += options.lineHeight;
    }
  };

  // A header row: left text shrunk-to-fit (never clipped) on one line, with an optional right-aligned
  // meta string (dates / location) on the same baseline.
  const writeRow = (
    left: string,
    right: string | undefined,
    options: { leftSize: number; leftColor: string; leftBold: boolean },
  ) => {
    const lineHeight = options.leftSize * 0.5 + 0.6;
    ensureSpace(lineHeight);
    let rightWidth = 0;
    if (right) {
      pdf.setFont(fontFamily, 'normal');
      pdf.setFontSize(sz(STRUCT_SIZE.contact));
      rightWidth = pdf.getTextWidth(right) + 3;
      pdf.setTextColor(INK_FAINT);
      pdf.text(right, rightX, y, { align: 'right' });
    }
    const avail = contentWidth - rightWidth;
    let leftSize = options.leftSize;
    pdf.setFont(fontFamily, options.leftBold ? 'bold' : 'normal');
    pdf.setFontSize(leftSize);
    const w = pdf.getTextWidth(left);
    if (w > avail && w > 0) {
      leftSize = Math.max(sz(6.2), (options.leftSize * avail) / w);
      pdf.setFontSize(leftSize);
    }
    pdf.setTextColor(options.leftColor);
    pdf.text(left, MX, y);
    y += lineHeight;
  };

  // Bullets render at a UNIFORM size (the global density `sz(bullet)`) — never per-bullet shrunk and
  // never wrapped. A bullet too wide for one line is split at clause boundaries into full single-line
  // bullets so every line looks full and all bullets share one size; the global density loop absorbs
  // the extra lines into one A4 page. Metric tokens stay bold. lineHeight is uniform so the vertical
  // rhythm never jitters, even for the rare unsplittable clause that must floor-shrink to avoid clip.
  const writeBullet = (text: string) => {
    const indent = 4.5;
    const avail = contentWidth - indent;
    const size = sz(STRUCT_SIZE.bullet);
    const lineHeight = size * 0.5 + 0.7;
    const lines = splitBulletForWidth(
      text,
      avail,
      (line) => measureRunWidth(pdf, splitMetricRuns(line), fontFamily, size),
    );
    for (const line of lines) {
      const runs = splitMetricRuns(line);
      // Only a single clause that cannot be split further ever shrinks — and only that one line — so
      // it never clips; every splittable bullet stays at the uniform size.
      let drawSize = size;
      const w = measureRunWidth(pdf, runs, fontFamily, size);
      if (w > avail && w > 0) drawSize = Math.max(sz(6), (size * avail) / w);
      ensureSpace(lineHeight);
      pdf.setFont(fontFamily, 'bold');
      pdf.setFontSize(drawSize);
      pdf.setTextColor(INK_SOFT);
      pdf.text('•', MX + 0.5, y);
      drawRunLine(pdf, runs, MX + indent, y, fontFamily, drawSize, INK_SOFT, INK);
      y += lineHeight;
    }
  };

  // Wrapped runs (used for the skills line so the group label is bold and the items wrap normally).
  const writeWrappedRuns = (runs: TextRun[], size: number, lineHeight: number) => {
    let x = MX;
    for (const run of runs) {
      pdf.setFont(fontFamily, run.bold ? 'bold' : 'normal');
      pdf.setFontSize(size);
      pdf.setTextColor(run.bold ? INK : INK_SOFT);
      const tokens = run.text.match(/\S+|\s+/g) ?? [];
      for (const token of tokens) {
        const tw = pdf.getTextWidth(token);
        if (x + tw > MX + contentWidth && x > MX) {
          y += lineHeight;
          x = MX;
          if (/^\s+$/.test(token)) continue;
        }
        ensureSpace(lineHeight);
        pdf.text(token, x, y);
        x += tw;
      }
    }
    y += lineHeight;
  };

  const sectionHeading = (heading: string) => {
    const hs = sz(STRUCT_SIZE.heading);
    ensureSpace(hs * 0.5 + sz(5));
    y += sz(1.2);
    pdf.setFont(fontFamily, 'bold');
    pdf.setFontSize(hs);
    pdf.setTextColor(INK);
    pdf.text(heading, centerX, y, { align: 'center' });
    y += sz(1.7);
    pdf.setDrawColor(INK_FAINT);
    pdf.setLineWidth(0.2);
    pdf.line(MX, y, rightX, y);
    y += sz(3.6);
  };

  // Header — centered name, title, contact line.
  pdf.setFont(fontFamily, 'bold');
  pdf.setFontSize(sz(STRUCT_SIZE.name));
  pdf.setTextColor(INK);
  pdf.text(doc.contact.fullName.toUpperCase(), centerX, y + sz(STRUCT_SIZE.name) * 0.32, { align: 'center' });
  y += sz(STRUCT_SIZE.name) * 0.46 + 1.4;
  if (doc.contact.title.trim()) {
    pdf.setFont(fontFamily, 'normal');
    pdf.setFontSize(sz(STRUCT_SIZE.title));
    pdf.setTextColor(INK_SOFT);
    pdf.text(doc.contact.title, centerX, y, { align: 'center' });
    y += sz(STRUCT_SIZE.title) * 0.5 + 0.4;
  }
  const contactLine = joinContactLine(doc.contact);
  if (contactLine) {
    pdf.setFont(fontFamily, 'normal');
    pdf.setFontSize(sz(STRUCT_SIZE.contact));
    pdf.setTextColor(INK_FAINT);
    pdf.text(contactLine, centerX, y, { align: 'center' });
    y += sz(STRUCT_SIZE.contact) * 0.5;
  }

  for (const section of doc.sections) {
    sectionHeading(section.heading);

    if (section.summary) {
      writeWrapped(section.summary, { size: sz(STRUCT_SIZE.summary), color: INK_SOFT, lineHeight: sz(STRUCT_SIZE.summary) * 0.5 + 0.4 });
      y += sz(1.6);
    }

    if (section.awards?.length) {
      const gutter = 6;
      const colWidth = (contentWidth - gutter) / 2;
      const colX = [MX, MX + colWidth + gutter];
      const titleLh = sz(STRUCT_SIZE.awardTitle) * 0.5 + 0.2;
      const detailLh = sz(STRUCT_SIZE.awardDetail) * 0.5 + 0.2;
      for (let i = 0; i < section.awards.length; i += 2) {
        const pair = [section.awards[i], section.awards[i + 1]];
        const rowHeight = Math.max(...pair.map((a) => (a ? titleLh + (a.detail ? detailLh : 0) : 0)), titleLh);
        ensureSpace(rowHeight + 1);
        const rowY = y;
        pair.forEach((award, col) => {
          if (!award) return;
          let cy = rowY;
          pdf.setFont(fontFamily, 'bold');
          pdf.setFontSize(sz(STRUCT_SIZE.awardTitle));
          pdf.setTextColor(INK);
          const titleLines = pdf.splitTextToSize(award.title, colWidth) as string[];
          pdf.text(titleLines[0] ?? '', colX[col], cy);
          cy += titleLh;
          if (award.detail) {
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(sz(STRUCT_SIZE.awardDetail));
            pdf.setTextColor(INK_FAINT);
            const detailLines = pdf.splitTextToSize(award.detail, colWidth) as string[];
            pdf.text(detailLines[0] ?? '', colX[col], cy);
          }
        });
        y = rowY + rowHeight + 1.4;
      }
      y += sz(0.8);
    }

    for (const exp of section.experience ?? []) {
      const orgLeft = [exp.org, exp.orgDetail ? `(${exp.orgDetail})` : null].filter(Boolean).join('  ');
      writeRow(orgLeft, exp.location, { leftSize: sz(STRUCT_SIZE.org), leftColor: INK, leftBold: false });
      const dates = [exp.start, exp.end].map((v) => v?.trim()).filter(Boolean).join(' - ');
      writeRow(exp.title, dates || undefined, { leftSize: sz(STRUCT_SIZE.role), leftColor: INK_SOFT, leftBold: true });
      if (exp.scope) {
        writeWrapped(exp.scope, { size: sz(STRUCT_SIZE.scope), color: INK_FAINT, lineHeight: sz(STRUCT_SIZE.scope) * 0.5 });
      }
      y += sz(0.4);
      for (const bullet of exp.bullets.filter((b) => b.trim())) writeBullet(bullet);
      y += sz(2.2);
    }

    for (const project of section.projects ?? []) {
      writeRow(project.name, project.location, { leftSize: sz(STRUCT_SIZE.proj), leftColor: INK, leftBold: false });
      if (project.scope) {
        writeWrapped(project.scope, { size: sz(STRUCT_SIZE.scope), color: INK_FAINT, lineHeight: sz(STRUCT_SIZE.scope) * 0.5 });
      }
      y += sz(0.4);
      for (const bullet of project.bullets.filter((b) => b.trim())) writeBullet(bullet);
      y += sz(2.2);
    }

    for (const edu of section.education ?? []) {
      const schoolLeft = [edu.school, edu.detail ? `- ${edu.detail}` : null].filter(Boolean).join(' ');
      writeRow(schoolLeft, edu.location, { leftSize: sz(STRUCT_SIZE.school), leftColor: INK, leftBold: false });
      const dates = [edu.start, edu.end].map((v) => v?.trim()).filter(Boolean).join(' - ');
      writeRow(edu.degree, dates || undefined, { leftSize: sz(STRUCT_SIZE.degree), leftColor: INK_SOFT, leftBold: false });
      y += sz(1.6);
    }

    if (section.skills?.length) {
      for (const group of section.skills) {
        const items = group.items.map((s) => s.trim()).filter(Boolean);
        if (!items.length) continue;
        const runs: TextRun[] = [];
        if (group.label?.trim()) runs.push({ text: `${group.label.trim()}: `, bold: true });
        runs.push({ text: items.join('  ·  '), bold: false });
        writeWrappedRuns(runs, sz(STRUCT_SIZE.skills), sz(STRUCT_SIZE.skills) * 0.5 + 0.4);
        y += sz(0.8);
      }
    }
  }

  return y;
}

export function createStructuredResumePdf(resume: StructuredResume, interFontBase64?: string): jsPDF {
  const doc = buildStructuredResumeDocument(resume);
  const fontFamily = interFontBase64 ? 'Inter' : 'helvetica';

  const makePdf = (): jsPDF => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    if (interFontBase64) {
      pdf.addFileToVFS('InterVariable.ttf', interFontBase64);
      pdf.addFont('InterVariable.ttf', 'Inter', 'normal');
      pdf.addFont('InterVariable.ttf', 'Inter', 'bold');
    }
    pdf.setProperties({
      title: `${resume.contact.fullName} — résumé`,
      subject: resume.contact.title,
      creator: 'Job Tracker',
    });
    return pdf;
  };

  // Pick the LARGEST density scale (1.0 → FLOOR) whose measured height fits one A4 page. Measurement
  // uses a throwaway pdf with the same font so text metrics match the final render exactly.
  const fitBottom = PAGE.height - STRUCT.marginBottom;
  let scale = STRUCT_FLOOR;
  for (let step = 100; step >= Math.round(STRUCT_FLOOR * 100); step -= 5) {
    const candidate = step / 100;
    if (renderStructuredInto(makePdf(), doc, candidate, fontFamily, false) <= fitBottom) {
      scale = candidate;
      break;
    }
  }

  const pdf = makePdf();
  renderStructuredInto(pdf, doc, scale, fontFamily, true);

  // Page numbers only when the résumé genuinely spilled past one page.
  const pageCount = pdf.getNumberOfPages();
  if (pageCount > 1) {
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setFont(fontFamily, 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(INK_FAINT);
      pdf.text(`${page} / ${pageCount}`, PAGE.width - STRUCT.marginX, PAGE.height - 8, { align: 'right' });
    }
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
