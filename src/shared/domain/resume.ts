// Structured résumé: the content source of truth (Wave B · B6).
//
// This module is the "content" half of the B6 content-vs-format split: a deterministic,
// environment-neutral model of Karan's résumé. The LLM parses a base PDF *into* this shape
// (B6.3) and rewords/reorders *within* it (B6.2); the renderer (resumePdf.ts) draws it
// deterministically. Layout never comes from the LLM — that is what guarantees both format
// fidelity and truthfulness.
//
// Nothing here invents content: every render string is traced back to a field on StructuredResume.

export interface ResumeLink {
  label: string; // e.g. "LinkedIn", "GitHub", "Portfolio"
  url?: string; // optional; rendered as a link annotation when present
}

export interface ResumeContact {
  fullName: string;
  title: string; // headline role, e.g. "Manager - Data Science (Commercial Marketing Decision Science)"
  phone?: string;
  email?: string;
  location?: string; // e.g. "Gurgaon, India"
  links: ResumeLink[];
}

export interface ResumeAward {
  title: string; // e.g. "2024 Centurion Award"
  detail?: string; // optional sub-line, e.g. "Highest award in American Express (Top 1%)"
}

export interface ResumeExperience {
  org: string; // e.g. "American Express"
  orgDetail?: string; // parenthetical/team, e.g. "CFR - Credit and Fraud Risk"
  location?: string; // right-aligned, e.g. "Gurgaon, India"
  title: string; // role, e.g. "Manager - Data Science"
  start: string; // free text, e.g. "07/2025"
  end: string; // free text, e.g. "Present"
  scope?: string; // the italic scope line above the bullets
  bullets: string[];
}

export interface ResumeProject {
  name: string;
  location?: string;
  scope?: string;
  bullets: string[];
}

export interface ResumeEducation {
  school: string; // e.g. "IIT Kharagpur"
  detail?: string; // e.g. "8.82" (CGPA / percentage) — rendered appended to the school
  location?: string;
  degree: string;
  start: string;
  end: string;
}

export interface ResumeSkillGroup {
  label?: string; // e.g. "Technology"; omitted for an unlabelled line
  items: string[];
}

export interface StructuredResume {
  contact: ResumeContact;
  summary: string;
  awards: ResumeAward[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  skills: ResumeSkillGroup[];
}

// --- Render model -------------------------------------------------------------------------------
// The builder flattens StructuredResume into an ordered list of non-empty sections. Section order
// is fixed (AC #3): summary → awards → experience → projects → education → skills. Empty sections
// are dropped so a résumé missing a section simply omits its heading (no fabricated placeholder).

export type ResumeSectionKind =
  | 'summary'
  | 'awards'
  | 'experience'
  | 'projects'
  | 'education'
  | 'skills';

export interface ResumeRenderSection {
  kind: ResumeSectionKind;
  heading: string;
  summary?: string;
  awards?: ResumeAward[];
  experience?: ResumeExperience[];
  projects?: ResumeProject[];
  education?: ResumeEducation[];
  skills?: ResumeSkillGroup[];
}

export interface StructuredResumeDocument {
  contact: ResumeContact;
  sections: ResumeRenderSection[];
}

// Heading labels for each section, in render order.
export const RESUME_SECTION_HEADINGS: Record<ResumeSectionKind, string> = {
  summary: 'Summary',
  awards: 'Key Awards and Achievements',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  skills: 'Skills',
};

const RESUME_SECTION_ORDER: ResumeSectionKind[] = [
  'summary',
  'awards',
  'experience',
  'projects',
  'education',
  'skills',
];

function hasText(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function skillGroupHasItems(group: ResumeSkillGroup): boolean {
  return group.items.some((item) => hasText(item));
}

// Maps StructuredResume → an ordered render document. Pure; drops empty sections; never invents.
export function buildStructuredResumeDocument(resume: StructuredResume): StructuredResumeDocument {
  const sections: ResumeRenderSection[] = [];

  for (const kind of RESUME_SECTION_ORDER) {
    const heading = RESUME_SECTION_HEADINGS[kind];
    if (kind === 'summary') {
      if (hasText(resume.summary)) sections.push({ kind, heading, summary: resume.summary.trim() });
    } else if (kind === 'awards') {
      const awards = resume.awards.filter((a) => hasText(a.title));
      if (awards.length) sections.push({ kind, heading, awards });
    } else if (kind === 'experience') {
      const experience = resume.experience.filter((e) => hasText(e.org) || hasText(e.title));
      if (experience.length) sections.push({ kind, heading, experience });
    } else if (kind === 'projects') {
      const projects = resume.projects.filter((p) => hasText(p.name));
      if (projects.length) sections.push({ kind, heading, projects });
    } else if (kind === 'education') {
      const education = resume.education.filter((e) => hasText(e.school));
      if (education.length) sections.push({ kind, heading, education });
    } else if (kind === 'skills') {
      const skills = resume.skills.filter(skillGroupHasItems);
      if (skills.length) sections.push({ kind, heading, skills });
    }
  }

  return { contact: resume.contact, sections };
}

// Flattens every render string a document would emit, in order. Used by tests to assert the
// "only-confirmed-content" guarantee: nothing the renderer draws should be absent from the source.
export function flattenResumeText(doc: StructuredResumeDocument): string[] {
  const out: string[] = [];
  const push = (value: string | undefined) => {
    if (hasText(value)) out.push(value.trim());
  };

  const { contact } = doc;
  push(contact.fullName);
  push(contact.title);
  push(contact.phone);
  push(contact.email);
  push(contact.location);
  for (const link of contact.links) push(link.label);

  for (const section of doc.sections) {
    push(section.heading);
    push(section.summary);
    for (const award of section.awards ?? []) {
      push(award.title);
      push(award.detail);
    }
    for (const exp of section.experience ?? []) {
      push(exp.org);
      push(exp.orgDetail);
      push(exp.location);
      push(exp.title);
      push(exp.start);
      push(exp.end);
      push(exp.scope);
      exp.bullets.forEach(push);
    }
    for (const project of section.projects ?? []) {
      push(project.name);
      push(project.location);
      push(project.scope);
      project.bullets.forEach(push);
    }
    for (const edu of section.education ?? []) {
      push(edu.school);
      push(edu.detail);
      push(edu.location);
      push(edu.degree);
      push(edu.start);
      push(edu.end);
    }
    for (const group of section.skills ?? []) {
      push(group.label);
      group.items.forEach(push);
    }
  }

  return out;
}

// Stable, PII-free download filename derived from the structured résumé + target role.
export function structuredResumeFilename(contact: ResumeContact, role?: string | null): string {
  const base = [contact.fullName, role, 'resume']
    .filter((value): value is string => hasText(value))
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'tailored-resume'}.pdf`;
}
