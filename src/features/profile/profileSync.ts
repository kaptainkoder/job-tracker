// Wave H — profile unification. The structured résumé (resume_structured) is the single edited
// source of truth. On save we MIRROR its contact + skills into the thin `profile` table so the
// downstream tailoring pipeline (resumeDocument.ts, TailorFlow header/skills) keeps working
// unchanged — no pipeline rewrite, no migration. This module owns that projection, kept pure so it
// can be unit-tested without Supabase.
import type { Profile } from '../../shared/types';
import type { StructuredResume } from '../../shared/domain/resume';

// The subset of `profile` columns the structured résumé owns. `resume_path` is deliberately absent —
// the upsert must never clobber it. `id` is added by the caller.
export type MirroredProfile = Pick<
  Profile,
  'full_name' | 'email' | 'phone' | 'current_title' | 'current_company' | 'linkedin_url' | 'github_url' | 'skills'
>;

function trimmedOrNull(value: string | undefined): string | null {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : null;
}

// Find the URL of the first link whose label matches any of the given aliases (case-insensitive
// substring — "LinkedIn", "LinkedIn Profile", etc. all match "linkedin").
function findLinkUrl(resume: StructuredResume, aliases: string[]): string | null {
  const link = resume.contact.links.find((l) => {
    const label = (l.label ?? '').toLowerCase();
    return aliases.some((a) => label.includes(a));
  });
  return trimmedOrNull(link?.url);
}

// Flatten the structured skill groups into deduped surface strings — the same shape the flat
// `profile.skills` textarea used to produce, so gap.ts / resumeDocument.ts consume it unchanged.
export function flattenStructuredSkills(resume: StructuredResume): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of resume.skills) {
    for (const item of group.items) {
      const v = item.trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

export function structuredToProfilePayload(resume: StructuredResume): MirroredProfile {
  const { contact } = resume;
  return {
    full_name: trimmedOrNull(contact.fullName),
    email: trimmedOrNull(contact.email),
    phone: trimmedOrNull(contact.phone),
    current_title: trimmedOrNull(contact.title),
    // ResumeContact has no company field — the current company is the org of the most recent
    // (top, reverse-chronological) experience entry.
    current_company: trimmedOrNull(resume.experience[0]?.org),
    linkedin_url: findLinkUrl(resume, ['linkedin']),
    github_url: findLinkUrl(resume, ['github']),
    skills: flattenStructuredSkills(resume),
  };
}
