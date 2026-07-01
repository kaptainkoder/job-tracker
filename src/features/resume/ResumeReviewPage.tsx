import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import Button from '../../shared/ui/Button';
import { supabase } from '../../shared/lib/supabase';
import type { UserSettings } from '../../shared/types';
import { useAuth } from '../auth/AuthProvider';
import { DEFAULT_SETTINGS_FORM, settingsToForm } from '../settings/settings';
import { streamLlm } from '../../shared/lib/llmClient';
import type {
  ResumeAward,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  ResumeSkillGroup,
  StructuredResume,
} from '../../shared/domain/resume';
import {
  buildParseResumeMessages,
  parseStructuredResumeResponse,
  PARSE_RESUME_ACTION,
  PARSE_RESUME_CATEGORIES,
} from '../../shared/domain/resumeParse';
import { extractPdfText } from './resumePdfText';
import { loadStructuredResume, saveStructuredResume, downloadBaseResume } from './resumeStore';
import { baseResumePath, validatePdfFile } from '../profile/profile';
import { structuredToProfilePayload } from '../profile/profileSync';

// B6.3 — the one-time-parse review/edit screen. Built to the canonical Claude Design
// (design-ref/b6.3-resume-review): a banner, six sections (Summary, Experience, Education, Skills,
// Honors & awards, Projects), per-entry cards with an edit pencil, Experience as a real bullet list
// with a Read more/Show less collapse, wrapping skill chips, and a save bar. Near-monochrome, one
// accent, honesty copy. Save persists the confirmed StructuredResume as the source of truth;
// Discard drops the parse without saving.

const META_SEP = ' · ';
const COLLAPSED_BULLETS = 3;

function dateRange(start: string, end: string): string {
  return [start, end].filter((v) => v && v.trim()).join(' – ');
}

function metaLine(parts: Array<string | undefined>): string {
  return parts.filter((p) => p && p.trim()).join(META_SEP);
}

type EditKey = string | null; // `${kind}:${index}`, or 'summary', 'skills', 'contact'

export default function ResumeReviewPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS_FORM);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resume, setResume] = useState<StructuredResume | null>(null);
  const [pendingParse, setPendingParse] = useState(false);
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [hasBaseResume, setHasBaseResume] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editKey, setEditKey] = useState<EditKey>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setLoadError(null);

    void Promise.all([
      loadStructuredResume(user.id),
      supabase.from('profile').select('resume_path').eq('id', user.id).maybeSingle(),
      supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]).then(([resumeResult, profileResult, settingsResult]) => {
      if (!active) return;
      if (resumeResult.error) {
        setLoadError(resumeResult.error);
      } else if (resumeResult.record) {
        setResume(resumeResult.record.content);
        setSourceFilename(resumeResult.record.source_filename);
        setConfirmedAt(resumeResult.record.confirmed_at);
        setPendingParse(false);
      }
      setHasBaseResume(Boolean((profileResult.data as { resume_path?: string | null } | null)?.resume_path));
      setSettings(settingsToForm((settingsResult.data as UserSettings | null) ?? null));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [user]);

  function mutate(next: StructuredResume) {
    setResume(next);
    setDirty(true);
    setSaveSuccess(null);
  }

  // --- Parse ------------------------------------------------------------------------------------

  async function parseFromBytes(bytes: ArrayBuffer, filename: string) {
    if (!user) return;
    setParsing(true);
    setParseError(null);
    setParseWarnings([]);
    setSaveSuccess(null);
    setParseStatus('Reading your résumé…');
    try {
      const { text, warnings } = await extractPdfText(bytes);
      if (!text.trim()) {
        throw new Error('No selectable text found in that PDF — it may be a scan. Try a text-based PDF.');
      }
      setParseStatus('Extracting your details… nothing is saved yet.');
      let raw = '';
      await streamLlm({
        action: PARSE_RESUME_ACTION,
        model: settings.model,
        noLog: settings.no_log,
        messages: buildParseResumeMessages({ resumeText: text }),
        includedCategories: PARSE_RESUME_CATEGORIES,
        accessToken: (await supabase.auth.getSession()).data.session?.access_token ?? null,
        onToken: (token) => {
          raw += token;
        },
      });
      const parsed = parseStructuredResumeResponse(raw);
      if (!parsed) throw new Error('The parser returned something unreadable. Try again.');
      setResume(parsed);
      setSourceFilename(filename);
      setPendingParse(true);
      setParseWarnings(warnings);
      setDirty(false);
      setExpanded({});
      setParseStatus(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not parse the résumé.');
      setParseStatus(null);
    } finally {
      setParsing(false);
    }
  }

  async function handleFilePick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const validation = await validatePdfFile(file);
    if (validation) {
      setParseError(validation);
      return;
    }
    await parseFromBytes(await file.arrayBuffer(), file.name);
  }

  async function handleParseBaseResume() {
    if (!user) return;
    setParseError(null);
    setParseWarnings([]);
    setParseStatus('Fetching your base résumé…');
    const { data, error } = await downloadBaseResume(baseResumePath(user.id));
    if (error || !data) {
      setParseError(error ?? 'Could not load your base résumé.');
      setParseStatus(null);
      return;
    }
    await parseFromBytes(data, 'base-resume.pdf');
  }

  // --- Save / discard ---------------------------------------------------------------------------

  async function handleSave() {
    if (!user || !resume) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    const { record, error } = await saveStructuredResume(user.id, resume, sourceFilename);
    if (error || !record) {
      setSaving(false);
      setSaveError(error ?? 'Could not save your résumé.');
      return;
    }
    // Wave H — mirror contact + skills into the thin `profile` table so the tailoring pipeline
    // (resumeDocument.ts header/skills) keeps reading from one kept-in-sync source. Never touch
    // resume_path. If the mirror fails the structured save still stands, so surface a soft error.
    const { error: mirrorError } = await supabase
      .from('profile')
      .upsert({ id: user.id, ...structuredToProfilePayload(resume) }, { onConflict: 'id' });
    setSaving(false);
    if (mirrorError) {
      setSaveError(`Saved your résumé, but syncing your profile details failed. ${mirrorError.message}`);
      return;
    }
    setConfirmedAt(record.confirmed_at);
    setPendingParse(false);
    setDirty(false);
    setEditKey(null);
    setSaveSuccess('Saved as your source of truth.');
  }

  function handleDiscard() {
    setResume(null);
    setPendingParse(false);
    setSourceFilename(null);
    setDirty(false);
    setEditKey(null);
    setExpanded({});
    setParseError(null);
    setParseWarnings([]);
    setSaveSuccess(null);
  }

  // --- Render -----------------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center" role="status">
        <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
        <span className="sr-only">Loading résumé</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <section className="card max-w-reading p-6" role="alert">
        <h1 className="text-h2 font-semibold text-ink">We couldn’t load your résumé</h1>
        <p className="mt-2 text-sm text-stage-rejected">{loadError}</p>
      </section>
    );
  }

  if (!resume) {
    return (
      <EmptyState
        parsing={parsing}
        parseStatus={parseStatus}
        parseError={parseError}
        hasBaseResume={hasBaseResume}
        onPick={() => fileInputRef.current?.click()}
        onUseBase={handleParseBaseResume}
        fileInputRef={fileInputRef}
        onFile={handleFilePick}
      />
    );
  }

  return (
    <div className="animate-rise mx-auto max-w-reading space-y-7 pb-28">
      <Header
        resume={resume}
        editing={editKey === 'contact'}
        onEdit={() => setEditKey('contact')}
        onCancel={() => setEditKey(null)}
        onSave={(contact) => {
          mutate({ ...resume, contact });
          setEditKey(null);
        }}
      />

      {pendingParse ? (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-accent-soft/50 p-4">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={2} />
          <div className="text-sm leading-6">
            <p className="font-semibold text-ink">Parsed from your résumé — please review</p>
            <p className="mt-0.5 text-ink-soft">
              From <span className="font-medium text-ink">{sourceFilename ?? 'your résumé'}</span>. Nothing
              is invented — only what your résumé says. Nothing is saved until you choose{' '}
              <span className="font-medium text-ink">Save résumé</span>.
            </p>
            {parseWarnings.map((warning) => (
              <p key={warning} className="mt-2 font-medium text-stage-interviewing" role="alert">
                {warning}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-ink-faint">
          <ShieldCheck className="h-3.5 w-3.5" />
          Your source of truth{confirmedAt ? ` · saved ${new Date(confirmedAt).toLocaleDateString()}` : ''}. Edits
          aren’t live until you save.
        </p>
      )}

      {/* Summary */}
      <Section heading="Summary" action="Edit" onAction={() => setEditKey('summary')}>
        {editKey === 'summary' ? (
          <SummaryEditor
            value={resume.summary}
            onCancel={() => setEditKey(null)}
            onSave={(summary) => {
              mutate({ ...resume, summary });
              setEditKey(null);
            }}
          />
        ) : resume.summary.trim() ? (
          <div className="card p-4 sm:p-5">
            <p className="text-sm leading-6 text-ink-soft">{resume.summary}</p>
          </div>
        ) : (
          <Empty>No summary yet.</Empty>
        )}
      </Section>

      {/* Experience */}
      <Section
        heading="Experience"
        action="+ Add"
        onAction={() => setEditKey('experience:new')}
      >
        {resume.experience.length === 0 && editKey !== 'experience:new' ? (
          <Empty>No experience yet.</Empty>
        ) : (
          <div className="space-y-3">
            {resume.experience.map((exp, index) =>
              editKey === `experience:${index}` ? (
                <ExperienceEditor
                  key={index}
                  value={exp}
                  onCancel={() => setEditKey(null)}
                  onDelete={() => {
                    mutate({ ...resume, experience: resume.experience.filter((_, i) => i !== index) });
                    setEditKey(null);
                  }}
                  onSave={(next) => {
                    mutate({
                      ...resume,
                      experience: resume.experience.map((e, i) => (i === index ? next : e)),
                    });
                    setEditKey(null);
                  }}
                />
              ) : (
                <ExperienceCard
                  key={index}
                  exp={exp}
                  expanded={Boolean(expanded[`exp-${index}`])}
                  onToggle={() =>
                    setExpanded((s) => ({ ...s, [`exp-${index}`]: !s[`exp-${index}`] }))
                  }
                  onEdit={() => setEditKey(`experience:${index}`)}
                />
              ),
            )}
            {editKey === 'experience:new' && (
              <ExperienceEditor
                value={blankExperience()}
                onCancel={() => setEditKey(null)}
                onSave={(next) => {
                  mutate({ ...resume, experience: [...resume.experience, next] });
                  setEditKey(null);
                }}
              />
            )}
          </div>
        )}
      </Section>

      {/* Education */}
      <Section
        heading="Education"
        action="+ Add"
        onAction={() => setEditKey('education:new')}
      >
        {resume.education.length === 0 && editKey !== 'education:new' ? (
          <Empty>No education yet.</Empty>
        ) : (
          <div className="space-y-3">
            {resume.education.map((edu, index) =>
              editKey === `education:${index}` ? (
                <EducationEditor
                  key={index}
                  value={edu}
                  onCancel={() => setEditKey(null)}
                  onDelete={() => {
                    mutate({ ...resume, education: resume.education.filter((_, i) => i !== index) });
                    setEditKey(null);
                  }}
                  onSave={(next) => {
                    mutate({
                      ...resume,
                      education: resume.education.map((e, i) => (i === index ? next : e)),
                    });
                    setEditKey(null);
                  }}
                />
              ) : (
                <ParagraphCard
                  key={index}
                  title={edu.degree || edu.school}
                  meta={metaLine([
                    edu.degree ? edu.school : undefined,
                    edu.detail ? `CGPA ${edu.detail}` : undefined,
                    dateRange(edu.start, edu.end),
                    edu.location,
                  ])}
                  body=""
                  onEdit={() => setEditKey(`education:${index}`)}
                />
              ),
            )}
            {editKey === 'education:new' && (
              <EducationEditor
                value={blankEducation()}
                onCancel={() => setEditKey(null)}
                onSave={(next) => {
                  mutate({ ...resume, education: [...resume.education, next] });
                  setEditKey(null);
                }}
              />
            )}
          </div>
        )}
      </Section>

      {/* Skills */}
      <Section heading="Skills" action="+ Add or edit" onAction={() => setEditKey('skills')}>
        {editKey === 'skills' ? (
          <SkillsEditor
            value={resume.skills}
            onCancel={() => setEditKey(null)}
            onSave={(skills) => {
              mutate({ ...resume, skills });
              setEditKey(null);
            }}
          />
        ) : (
          <SkillsView groups={resume.skills} onEdit={() => setEditKey('skills')} />
        )}
      </Section>

      {/* Honors & awards */}
      <Section
        heading="Honors & awards"
        action="+ Add"
        onAction={() => setEditKey('awards:new')}
      >
        {resume.awards.length === 0 && editKey !== 'awards:new' ? (
          <Empty>No honors or awards yet.</Empty>
        ) : (
          <div className="space-y-3">
            {resume.awards.map((award, index) =>
              editKey === `awards:${index}` ? (
                <AwardEditor
                  key={index}
                  value={award}
                  onCancel={() => setEditKey(null)}
                  onDelete={() => {
                    mutate({ ...resume, awards: resume.awards.filter((_, i) => i !== index) });
                    setEditKey(null);
                  }}
                  onSave={(next) => {
                    mutate({ ...resume, awards: resume.awards.map((a, i) => (i === index ? next : a)) });
                    setEditKey(null);
                  }}
                />
              ) : (
                <ParagraphCard
                  key={index}
                  title={award.title}
                  meta=""
                  body={award.detail ?? ''}
                  onEdit={() => setEditKey(`awards:${index}`)}
                />
              ),
            )}
            {editKey === 'awards:new' && (
              <AwardEditor
                value={{ title: '' }}
                onCancel={() => setEditKey(null)}
                onSave={(next) => {
                  mutate({ ...resume, awards: [...resume.awards, next] });
                  setEditKey(null);
                }}
              />
            )}
          </div>
        )}
      </Section>

      {/* Projects */}
      <Section
        heading="Projects"
        action="+ Add"
        onAction={() => setEditKey('projects:new')}
      >
        {resume.projects.length === 0 && editKey !== 'projects:new' ? (
          <Empty>No projects yet.</Empty>
        ) : (
          <div className="space-y-3">
            {resume.projects.map((project, index) =>
              editKey === `projects:${index}` ? (
                <ProjectEditor
                  key={index}
                  value={project}
                  onCancel={() => setEditKey(null)}
                  onDelete={() => {
                    mutate({ ...resume, projects: resume.projects.filter((_, i) => i !== index) });
                    setEditKey(null);
                  }}
                  onSave={(next) => {
                    mutate({
                      ...resume,
                      projects: resume.projects.map((p, i) => (i === index ? next : p)),
                    });
                    setEditKey(null);
                  }}
                />
              ) : (
                <ParagraphCard
                  key={index}
                  title={project.name}
                  meta={metaLine([project.location, project.scope])}
                  body={project.bullets.join(' ')}
                  onEdit={() => setEditKey(`projects:${index}`)}
                />
              ),
            )}
            {editKey === 'projects:new' && (
              <ProjectEditor
                value={blankProject()}
                onCancel={() => setEditKey(null)}
                onSave={(next) => {
                  mutate({ ...resume, projects: [...resume.projects, next] });
                  setEditKey(null);
                }}
              />
            )}
          </div>
        )}
      </Section>

      {/* Save bar */}
      <div className="sticky bottom-0 -mx-5 mt-2 border-t border-line bg-canvas/85 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="mx-auto flex max-w-reading flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm" aria-live="polite">
            {saveError ? (
              <p className="text-stage-rejected" role="alert">{saveError}</p>
            ) : saveSuccess ? (
              <p className="flex items-center gap-1.5 text-stage-offer"><Check className="h-4 w-4" />{saveSuccess}</p>
            ) : (
              <p className="text-ink-faint">
                Saving makes this your source of truth — tailoring rewords only what’s here, never inventing.
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="lg" onClick={handleDiscard} disabled={saving}>
              {pendingParse ? 'Discard parse' : 'Discard'}
            </Button>
            <Button size="lg" onClick={handleSave} disabled={saving || (!dirty && !pendingParse)}>
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save résumé'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Blank factories ----------------------------------------------------------------------------

function blankExperience(): ResumeExperience {
  return { org: '', title: '', start: '', end: '', bullets: [] };
}
function blankEducation(): ResumeEducation {
  return { school: '', degree: '', start: '', end: '' };
}
function blankProject(): ResumeProject {
  return { name: '', bullets: [] };
}

// --- Layout primitives --------------------------------------------------------------------------

function Section({
  heading,
  action,
  onAction,
  children,
}: {
  heading: string;
  action: string;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.9375rem] font-semibold text-ink">{heading}</h2>
        <Button variant="secondary" size="sm" onClick={onAction}>{action}</Button>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-4 py-5 text-sm text-ink-faint">
      {children}
    </div>
  );
}

function PencilButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-ink-faint transition hover:bg-surface-2 hover:text-ink"
    >
      <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}

function CardTitleRow({ title, onEdit }: { title: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h3 className="font-semibold text-ink">{title || 'Untitled'}</h3>
      <PencilButton onClick={onEdit} label={`Edit ${title || 'entry'}`} />
    </div>
  );
}

function ExperienceCard({
  exp,
  expanded,
  onToggle,
  onEdit,
}: {
  exp: ResumeExperience;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const meta = metaLine([
    exp.orgDetail ? `${exp.org} (${exp.orgDetail})` : exp.org,
    dateRange(exp.start, exp.end),
    exp.location,
  ]);
  const hidden = Math.max(0, exp.bullets.length - COLLAPSED_BULLETS);
  const shown = expanded ? exp.bullets : exp.bullets.slice(0, COLLAPSED_BULLETS);
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <CardTitleRow title={exp.title} onEdit={onEdit} />
      {meta && <p className="mt-1 text-sm text-ink-soft">{meta}</p>}
      {(exp.scope || exp.bullets.length > 0) && <div className="my-3 border-t border-line-soft" />}
      {exp.scope && <p className="mb-2 text-sm italic text-ink-soft">{exp.scope}</p>}
      {exp.bullets.length > 0 && (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-soft marker:text-ink-faint">
          {shown.map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent"
        >
          {expanded ? (
            <><ChevronUp className="h-3.5 w-3.5" />Show less</>
          ) : (
            <><ChevronDown className="h-3.5 w-3.5" />Read more — {hidden} more</>
          )}
        </button>
      )}
    </div>
  );
}

function ParagraphCard({
  title,
  meta,
  body,
  onEdit,
}: {
  title: string;
  meta: string;
  body: string;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <CardTitleRow title={title} onEdit={onEdit} />
      {meta && <p className="mt-1 text-sm text-ink-soft">{meta}</p>}
      {body.trim() && (
        <>
          <div className="my-3 border-t border-line-soft" />
          <p className="text-sm leading-6 text-ink-soft">{body}</p>
        </>
      )}
    </div>
  );
}

function SkillsView({ groups, onEdit }: { groups: ResumeSkillGroup[]; onEdit: () => void }) {
  const allItems = groups.flatMap((g) => g.items);
  if (allItems.length === 0) {
    return <Empty>No skills yet.</Empty>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((group, gi) =>
        group.items.map((item, ii) => (
          <span
            key={`${gi}-${ii}`}
            className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-soft"
          >
            {item}
          </span>
        )),
      )}
      <button
        type="button"
        onClick={onEdit}
        className="rounded-full border border-dashed border-accent px-3 py-1 text-sm font-medium text-accent transition hover:bg-accent-soft/50"
      >
        + Add or edit
      </button>
    </div>
  );
}

function Header({
  resume,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  resume: StructuredResume;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (contact: StructuredResume['contact']) => void;
}) {
  const { contact } = resume;
  if (editing) {
    return <ContactEditor value={contact} onCancel={onCancel} onSave={onSave} />;
  }
  const meta = metaLine([contact.location, contact.email, contact.phone]);
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent">Profile · source of truth</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold text-ink">{contact.fullName || 'Your profile'}</h1>
          {contact.title && <p className="mt-0.5 text-sm text-ink-soft">{contact.title}</p>}
          {(meta || contact.links.length > 0) && (
            <p className="mt-1 text-sm text-ink-faint">
              {meta}
              {meta && contact.links.length > 0 ? META_SEP : null}
              {contact.links.map((link, index) => {
                const href = safeExternalHref(link.url);
                return (
                  <span key={`${link.label}-${index}`}>
                    {index > 0 ? META_SEP : null}
                    {href ? (
                      <a className="font-medium text-accent hover:underline" href={href} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    ) : (
                      link.label
                    )}
                  </span>
                );
              })}
            </p>
          )}
        </div>
        <PencilButton onClick={onEdit} label="Edit contact details" />
      </div>
    </div>
  );
}

function safeExternalHref(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

// --- Editors ------------------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      <input
        className="input mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function EditorShell({
  children,
  onCancel,
  onSave,
  onDelete,
}: {
  children: ReactNode;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-xl border border-accent/40 bg-surface p-4 shadow-card sm:p-5">
      <div className="space-y-3">{children}</div>
      <div className="mt-4 flex items-center justify-between gap-2">
        {onDelete ? (
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-stage-rejected">
            <Trash2 className="h-3.5 w-3.5" />Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}><X className="h-3.5 w-3.5" />Cancel</Button>
          <Button size="sm" onClick={onSave}><Check className="h-3.5 w-3.5" />Done</Button>
        </div>
      </div>
    </div>
  );
}

function SummaryEditor({
  value,
  onCancel,
  onSave,
}: {
  value: string;
  onCancel: () => void;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <EditorShell onCancel={onCancel} onSave={() => onSave(draft.trim())}>
      <label className="block">
        <span className="text-xs font-medium text-ink-soft">Summary</span>
        <textarea
          className="input mt-1 resize-y"
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Your professional summary — only what your résumé says."
        />
      </label>
    </EditorShell>
  );
}

function ContactEditor({
  value,
  onCancel,
  onSave,
}: {
  value: StructuredResume['contact'];
  onCancel: () => void;
  onSave: (v: StructuredResume['contact']) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [linksText, setLinksText] = useState(
    value.links.map((link) => [link.label, link.url].filter(Boolean).join(' | ')).join('\n'),
  );
  const set = (patch: Partial<StructuredResume['contact']>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <EditorShell
      onCancel={onCancel}
      onSave={() =>
        onSave({
          ...draft,
          links: linksText
            .split(/\r?\n/)
            .map((line) => {
              const [label = '', ...urlParts] = line.split('|');
              const url = urlParts.join('|').trim();
              return { label: label.trim(), ...(url ? { url } : {}) };
            })
            .filter((link) => link.label.length > 0),
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" value={draft.fullName} onChange={(v) => set({ fullName: v })} />
        <Field label="Headline / title" value={draft.title} onChange={(v) => set({ title: v })} />
        <Field label="Email" value={draft.email ?? ''} onChange={(v) => set({ email: v })} />
        <Field label="Phone" value={draft.phone ?? ''} onChange={(v) => set({ phone: v })} />
        <Field label="Location" value={draft.location ?? ''} onChange={(v) => set({ location: v })} />
      </div>
      <label className="block">
        <span className="text-xs font-medium text-ink-soft">Links — one per line as Label | URL</span>
        <textarea
          className="input mt-1 resize-y"
          rows={3}
          value={linksText}
          onChange={(event) => setLinksText(event.target.value)}
          placeholder="LinkedIn | https://www.linkedin.com/in/your-profile"
        />
      </label>
    </EditorShell>
  );
}

function bulletsToText(bullets: string[]): string {
  return bullets.join('\n');
}
function textToBullets(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function ExperienceEditor({
  value,
  onCancel,
  onSave,
  onDelete,
}: {
  value: ResumeExperience;
  onCancel: () => void;
  onSave: (v: ResumeExperience) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [bulletText, setBulletText] = useState(bulletsToText(value.bullets));
  const set = (patch: Partial<ResumeExperience>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <EditorShell
      onCancel={onCancel}
      onDelete={onDelete}
      onSave={() => onSave({ ...draft, bullets: textToBullets(bulletText) })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role / title" value={draft.title} onChange={(v) => set({ title: v })} />
        <Field label="Organization" value={draft.org} onChange={(v) => set({ org: v })} />
        <Field label="Team / detail" value={draft.orgDetail ?? ''} onChange={(v) => set({ orgDetail: v })} />
        <Field label="Location" value={draft.location ?? ''} onChange={(v) => set({ location: v })} />
        <Field label="Start" value={draft.start} onChange={(v) => set({ start: v })} placeholder="July 2025" />
        <Field label="End" value={draft.end} onChange={(v) => set({ end: v })} placeholder="Present" />
      </div>
      <Field label="Scope (optional)" value={draft.scope ?? ''} onChange={(v) => set({ scope: v })} />
      <label className="block">
        <span className="text-xs font-medium text-ink-soft">Achievements — one bullet per line</span>
        <textarea
          className="input mt-1 resize-y"
          rows={5}
          value={bulletText}
          onChange={(e) => setBulletText(e.target.value)}
        />
      </label>
    </EditorShell>
  );
}

function EducationEditor({
  value,
  onCancel,
  onSave,
  onDelete,
}: {
  value: ResumeEducation;
  onCancel: () => void;
  onSave: (v: ResumeEducation) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const set = (patch: Partial<ResumeEducation>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <EditorShell onCancel={onCancel} onDelete={onDelete} onSave={() => onSave(draft)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Degree" value={draft.degree} onChange={(v) => set({ degree: v })} />
        <Field label="School" value={draft.school} onChange={(v) => set({ school: v })} />
        <Field label="CGPA / detail" value={draft.detail ?? ''} onChange={(v) => set({ detail: v })} />
        <Field label="Location" value={draft.location ?? ''} onChange={(v) => set({ location: v })} />
        <Field label="Start" value={draft.start} onChange={(v) => set({ start: v })} />
        <Field label="End" value={draft.end} onChange={(v) => set({ end: v })} />
      </div>
    </EditorShell>
  );
}

function AwardEditor({
  value,
  onCancel,
  onSave,
  onDelete,
}: {
  value: ResumeAward;
  onCancel: () => void;
  onSave: (v: ResumeAward) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <EditorShell onCancel={onCancel} onDelete={onDelete} onSave={() => onSave(draft)}>
      <Field label="Title" value={draft.title} onChange={(v) => setDraft((d) => ({ ...d, title: v }))} />
      <Field label="Detail (optional)" value={draft.detail ?? ''} onChange={(v) => setDraft((d) => ({ ...d, detail: v }))} />
    </EditorShell>
  );
}

function ProjectEditor({
  value,
  onCancel,
  onSave,
  onDelete,
}: {
  value: ResumeProject;
  onCancel: () => void;
  onSave: (v: ResumeProject) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [bulletText, setBulletText] = useState(bulletsToText(value.bullets));
  const set = (patch: Partial<ResumeProject>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <EditorShell
      onCancel={onCancel}
      onDelete={onDelete}
      onSave={() => onSave({ ...draft, bullets: textToBullets(bulletText) })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={draft.name} onChange={(v) => set({ name: v })} />
        <Field label="Location" value={draft.location ?? ''} onChange={(v) => set({ location: v })} />
      </div>
      <Field label="Scope (optional)" value={draft.scope ?? ''} onChange={(v) => set({ scope: v })} />
      <label className="block">
        <span className="text-xs font-medium text-ink-soft">Details — one line per point</span>
        <textarea
          className="input mt-1 resize-y"
          rows={4}
          value={bulletText}
          onChange={(e) => setBulletText(e.target.value)}
        />
      </label>
    </EditorShell>
  );
}

function SkillsEditor({
  value,
  onCancel,
  onSave,
}: {
  value: ResumeSkillGroup[];
  onCancel: () => void;
  onSave: (v: ResumeSkillGroup[]) => void;
}) {
  // Editable as one group per row: an optional label + a comma/newline-separated item list. Empty
  // groups are dropped on save so nothing blank is persisted.
  const [groups, setGroups] = useState<Array<{ label: string; itemsText: string }>>(
    value.length
      ? value.map((g) => ({ label: g.label ?? '', itemsText: g.items.join(', ') }))
      : [{ label: '', itemsText: '' }],
  );
  const setGroup = (i: number, patch: Partial<{ label: string; itemsText: string }>) =>
    setGroups((gs) => gs.map((g, gi) => (gi === i ? { ...g, ...patch } : g)));

  function commit() {
    const next: ResumeSkillGroup[] = [];
    for (const g of groups) {
      const items = g.itemsText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!items.length) continue;
      const group: ResumeSkillGroup = { items };
      if (g.label.trim()) group.label = g.label.trim();
      next.push(group);
    }
    onSave(next);
  }

  return (
    <EditorShell onCancel={onCancel} onSave={commit}>
      {groups.map((g, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label="Group (optional)" value={g.label} onChange={(v) => setGroup(i, { label: v })} placeholder="e.g. Technology" />
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">Skills — comma or line separated</span>
            <textarea
              className="input mt-1 resize-y"
              rows={2}
              value={g.itemsText}
              onChange={(e) => setGroup(i, { itemsText: e.target.value })}
              placeholder="Python, SQL, XGBoost"
            />
          </label>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setGroups((gs) => [...gs, { label: '', itemsText: '' }])}
      >
        <Plus className="h-3.5 w-3.5" />Add a group
      </Button>
    </EditorShell>
  );
}

// --- Empty state (no résumé yet) ----------------------------------------------------------------

function EmptyState({
  parsing,
  parseStatus,
  parseError,
  hasBaseResume,
  onPick,
  onUseBase,
  fileInputRef,
  onFile,
}: {
  parsing: boolean;
  parseStatus: string | null;
  parseError: string | null;
  hasBaseResume: boolean;
  onPick: () => void;
  onUseBase: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="animate-rise mx-auto max-w-reading space-y-6">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent">Profile · source of truth</p>
        <h1 className="mt-1 text-h1 font-semibold text-ink">Set up your profile</h1>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          Parse your résumé once into a structured profile you can confirm and correct. Tailoring then
          rewords only what’s here — it never invents experience.
        </p>
      </div>

      {/* One-time setup flow — the "do this once" highlight Karan asked for. */}
      <div className="card border-line-soft bg-surface-2/40 p-5">
        <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.16em] text-accent">
          <FileText className="h-3.5 w-3.5" />Set up once — how it works
        </p>
        <ol className="mt-3 space-y-2.5 text-sm text-ink-soft">
          {[
            <>
              <span className="font-medium text-ink">Upload your résumé PDF.</span> It’s read in your
              browser; only the extracted text is sent, with no-log routing (audited in your Privacy Log).
            </>,
            <>
              <span className="font-medium text-ink">Review the parsed sections.</span> Contact, summary,
              experience, education, skills, awards and projects — edit anything that’s off, add anything missing.
            </>,
            <>
              <span className="font-medium text-ink">Save.</span> This becomes your source of truth.
              Tailoring rewords only what’s here. You only redo this when your résumé actually changes.
            </>,
          ].map((step, index) => (
            <li key={index} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">
                {index + 1}
              </span>
              <span className="leading-6">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <section className="card p-6">
        <div className="flex gap-3">
          <span className="h-fit rounded-xl bg-accent-soft p-2 text-accent"><FileText className="h-5 w-5" /></span>
          <div className="flex-1">
            <h2 className="font-semibold text-ink">Parse a résumé</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              The PDF is read in your browser; only the extracted text is sent for structuring, with
              no-log routing, and it’s audited in your Privacy Log. Nothing is saved until you review and
              choose Save.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {hasBaseResume && (
                <Button size="lg" onClick={onUseBase} disabled={parsing}>
                  {parsing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Use my base résumé
                </Button>
              )}
              <Button variant={hasBaseResume ? 'secondary' : 'primary'} size="lg" onClick={onPick} disabled={parsing}>
                <Upload className="h-4 w-4" />Choose a PDF
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={onFile}
                className="sr-only"
                aria-label="Choose a résumé PDF to parse"
              />
            </div>
            <div className="mt-3 min-h-5 text-sm" aria-live="polite">
              {parseError ? (
                <p className="text-stage-rejected" role="alert">{parseError}</p>
              ) : parseStatus ? (
                <p className="flex items-center gap-1.5 text-ink-soft"><LoaderCircle className="h-4 w-4 animate-spin" />{parseStatus}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
