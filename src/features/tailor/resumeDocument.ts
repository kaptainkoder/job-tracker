import type { Application, Profile } from '../../shared/types';

export type ResumeItemKind = 'paragraph' | 'bullet' | 'subheading';

export interface ResumeItem {
  kind: ResumeItemKind;
  text: string;
}

export interface ResumeSection {
  heading: string;
  items: ResumeItem[];
}

export interface ResumeDocument {
  name: string;
  headline: string;
  contact: string[];
  tailoredFor: string;
  sections: ResumeSection[];
  skills: string[];
}

export interface ResumeDocumentInput {
  content: string;
  profile: Profile;
  application: Application;
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayUrl(value: string): string {
  return value.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function parseSections(content: string): ResumeSection[] {
  const sections: ResumeSection[] = [];
  let current: ResumeSection | null = null;

  const ensureCurrent = () => {
    if (!current) {
      current = { heading: 'Summary', items: [] };
      sections.push(current);
    }
    return current;
  };

  for (const rawLine of content.replace(/```[a-z]*\n?/gi, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = cleanInlineMarkdown(heading[2]);
      if (level === 1 && /^(tailored\s+)?r[ée]sum[ée]$/i.test(text)) continue;
      if (level <= 2) {
        current = { heading: text, items: [] };
        sections.push(current);
      } else {
        ensureCurrent().items.push({ kind: 'subheading', text });
      }
      continue;
    }

    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      ensureCurrent().items.push({ kind: 'bullet', text: cleanInlineMarkdown(bullet[1]) });
    } else {
      ensureCurrent().items.push({ kind: 'paragraph', text: cleanInlineMarkdown(line) });
    }
  }

  return sections.filter((section) => section.items.length > 0);
}

export function buildResumeDocument({ content, profile, application }: ResumeDocumentInput): ResumeDocument {
  const headline = [profile.current_title, profile.current_company]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' · ');
  const contact = [
    profile.email?.trim() || null,
    profile.phone?.trim() || null,
    profile.linkedin_url ? displayUrl(profile.linkedin_url.trim()) : null,
    profile.github_url ? displayUrl(profile.github_url.trim()) : null,
  ].filter((value): value is string => Boolean(value));
  const company = application.company.trim() || 'unspecified company';
  const role = application.role.trim() || 'unspecified role';

  return {
    name: profile.full_name?.trim() || 'Name not provided',
    headline,
    contact,
    tailoredFor: `Tailored for ${role} at ${company}`,
    sections: parseSections(content),
    skills: profile.skills.map((skill) => skill.trim()).filter(Boolean),
  };
}

export function safeResumeFilename(application: Application, fullName?: string | null): string {
  const base = [fullName, application.company, application.role, 'resume']
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'tailored-resume'}.pdf`;
}
