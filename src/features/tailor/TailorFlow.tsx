import {
  Check,
  Copy,
  Download,
  FileCheck2,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Square,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Application, Artifact, Profile, UserSettings } from '../../shared/types';
import {
  computeGap,
  foldResolutions,
  resolveGap,
  type FoldedResolutions,
  type SkillId,
} from '../../shared/domain/gap';
import {
  buildTailorMessages,
  buildTailorResumeMessages,
  tailorStructuredResume,
  TAILOR_ACTIONS,
  TAILOR_ACTION_LABEL,
  TAILOR_PRIVACY_ACTION,
  tailorIncludedCategories,
  type TailorAction,
  type TailorContext,
} from '../../shared/domain/tailor';
import {
  buildStructuredResumeDocument,
  flattenResumeText,
  type StructuredResume,
} from '../../shared/domain/resume';
import { loadStructuredResume } from '../resume/resumeStore';
import {
  buildManifest,
  preflightKey,
  PRIVACY_CATEGORY_LABEL,
  requiresPreflight,
  type PrivacyManifest,
} from '../../shared/domain/privacy';
import { streamLlm } from '../../shared/lib/llmClient';
import { supabase } from '../../shared/lib/supabase';
import Badge from '../../shared/ui/Badge';
import Button from '../../shared/ui/Button';
import PreflightModal from '../../shared/ui/PreflightModal';
import { useAuth } from '../auth/AuthProvider';
import { ModalShell } from '../tracker/ApplicationForm';
import { DEFAULT_SETTINGS_FORM, modelLabel, settingsToForm } from '../settings/settings';
import StructuredResumePreview from './StructuredResumePreview';
import { insertTailorArtifact } from './tailorArtifacts';

interface TailorFlowProps {
  application: Application;
  onClose: () => void;
  onArtifactSaved: (artifact: Artifact) => void;
}

interface DecisionDraft {
  confirmed: boolean;
  evidence: string;
}

type DecisionDrafts = Partial<Record<SkillId, DecisionDraft>>;
type ActionStatus = 'idle' | 'streaming' | 'saved';
type FlowStage = 'privacy' | 'gaps' | 'generating' | 'results';

const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  idle: 'Waiting',
  streaming: 'Generating',
  saved: 'Saved',
};

const KIT_PRIVACY_MANIFEST: PrivacyManifest = buildManifest([
  'job-description',
  'profile-summary',
  'work-history',
  'skills',
  'contact-info',
]);

const FLOW_STEPS: Array<{ stage: FlowStage; label: string }> = [
  { stage: 'privacy', label: 'Privacy review' },
  { stage: 'gaps', label: 'Evidence check' },
  { stage: 'generating', label: 'Generate' },
  { stage: 'results', label: 'Results' },
];

function ManifestColumns({ manifest }: { manifest: PrivacyManifest }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <Badge tone="eyebrow">Sent</Badge>
        <ul className="mt-2.5 space-y-1.5 text-sm text-ink">
          {manifest.sent.map((category) => (
            <li key={category} className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 shrink-0 text-stage-applied" />
              {PRIVACY_CATEGORY_LABEL[category]}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <Badge tone="eyebrow">Withheld</Badge>
        <ul className="mt-2.5 space-y-1.5 text-sm text-ink-faint">
          {manifest.withheld.map((category) => (
            <li key={category} className="line-through">{PRIVACY_CATEGORY_LABEL[category]}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function TailorFlow({ application, onClose, onArtifactSaved }: TailorFlowProps) {
  const { user, session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS_FORM);
  // The confirmed structured résumé (B6.3) — the truthful source the tailor action rewords. Null
  // means onboarding isn't done yet, which gates the résumé action (B6.4 AC#2).
  const [structuredResume, setStructuredResume] = useState<StructuredResume | null>(null);
  // The applied tailored StructuredResume for THIS run — drives the preview + download + the JSON
  // persisted in the artifact, so preview == download (B6.4 AC#3/#4).
  const [tailoredResume, setTailoredResume] = useState<StructuredResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<FlowStage>('privacy');
  const [decisions, setDecisions] = useState<DecisionDrafts>({});
  const [resolutions, setResolutions] = useState<FoldedResolutions | null>(null);
  const [currentAction, setCurrentAction] = useState<TailorAction>('tailor');
  const [activeTab, setActiveTab] = useState<TailorAction>('tailor');
  const [pendingAction, setPendingAction] = useState<TailorAction | null>(null);
  const [approvedKeys, setApprovedKeys] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<Partial<Record<TailorAction, string>>>({});
  const [statuses, setStatuses] = useState<Record<TailorAction, ActionStatus>>({
    tailor: 'idle', cover: 'idle', prep: 'idle',
  });
  const [flowError, setFlowError] = useState<string | null>(null);
  const [auditNote, setAuditNote] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      supabase.from('profile').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      loadStructuredResume(user.id),
    ]).then(([profileResult, settingsResult, resumeResult]) => {
      if (!active) return;
      if (profileResult.error) {
        setLoadError(`Could not load your profile. ${profileResult.error.message}`);
      } else if (!profileResult.data) {
        setLoadError('Create your profile before tailoring so the model has a truthful source.');
      } else if (settingsResult.error) {
        setLoadError(`Could not load your model settings. ${settingsResult.error.message}`);
      } else {
        setProfile(profileResult.data as Profile);
        setSettings(settingsToForm(settingsResult.data as UserSettings | null));
        // A confirmed structured résumé is the source for the tailor action. A missing one is not a
        // fatal error (cover/prep still run) — it just gates the résumé tab.
        setStructuredResume(
          resumeResult.record?.confirmed_at ? resumeResult.record.content : null,
        );
      }
      setLoading(false);
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [user]);

  const resumeReady = structuredResume !== null;

  const gap = useMemo(
    () => computeGap({ jdText: application.jd_text ?? '', evidence: profile?.skills ?? [] }),
    [application.jd_text, profile?.skills],
  );

  const allGapsResolved = gap.gaps.every((question) => {
    const decision = decisions[question.skill];
    return Boolean(decision && (!decision.confirmed || decision.evidence.trim()));
  });

  function updateDecision(skill: SkillId, confirmed: boolean) {
    setDecisions((current) => ({
      ...current,
      [skill]: { confirmed, evidence: current[skill]?.evidence ?? '' },
    }));
  }

  function updateEvidence(skill: SkillId, evidence: string) {
    setDecisions((current) => ({ ...current, [skill]: { confirmed: true, evidence } }));
  }

  function finishGapStep() {
    if (!allGapsResolved) return;
    const folded = foldResolutions(gap.gaps.map((question) => resolveGap({
      skill: question.skill,
      confirmed: decisions[question.skill]?.confirmed ?? false,
      evidence: decisions[question.skill]?.evidence,
    })));
    setResolutions(folded);
    setStage('generating');
    // The résumé action only runs when a confirmed structured résumé exists; otherwise the chain
    // starts at the cover letter and the résumé tab shows a "set up your résumé" guide (B6.4 AC#2).
    requestAction(resumeReady ? 'tailor' : 'cover', folded);
  }

  function contextFor(action: TailorAction, folded = resolutions): TailorContext | null {
    if (!profile || !folded) return null;
    return {
      action,
      company: application.company,
      role: application.role,
      jdText: application.jd_text ?? '',
      profile: {
        fullName: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        currentTitle: profile.current_title,
        currentCompany: profile.current_company,
        linkedinUrl: profile.linkedin_url,
        githubUrl: profile.github_url,
        skills: profile.skills,
      },
      truthfulAdditions: folded.truthfulAdditions,
      futureSuggestions: folded.futureSuggestions,
    };
  }

  function requestAction(action: TailorAction, folded = resolutions) {
    const context = contextFor(action, folded);
    if (!context) return;
    setCurrentAction(action);
    setFlowError(null);
    const manifest = buildManifest(tailorIncludedCategories(context));
    const privacyAction = TAILOR_PRIVACY_ACTION[action];
    if (requiresPreflight({ target: 'openrouter', action: privacyAction, manifest, approvedKeys })) {
      setPendingAction(action);
      return;
    }
    void runAction(action, folded);
  }

  function approvePreflight() {
    if (!pendingAction) return;
    const action = pendingAction;
    const key = preflightKey('openrouter', TAILOR_PRIVACY_ACTION[action]);
    setApprovedKeys((current) => current.includes(key) ? current : [...current, key]);
    setPendingAction(null);
    void runAction(action);
  }

  async function runAction(action: TailorAction, folded = resolutions) {
    const context = contextFor(action, folded);
    if (!context || !user) return;
    // The résumé action runs the STRUCTURED path (B6.4): the model returns a JSON reword/reorder
    // patch over the confirmed structured résumé, never free prose. cover/prep keep the prose path.
    const structuredTailor = action === 'tailor';
    if (structuredTailor && !structuredResume) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    let content = '';
    setOutputs((current) => ({ ...current, [action]: '' }));
    setStatuses((current) => ({ ...current, [action]: 'streaming' }));
    setFlowError(null);
    setAuditNote(null);

    try {
      await streamLlm({
        action,
        model: settings.model,
        noLog: settings.no_log,
        messages: structuredTailor
          ? buildTailorResumeMessages({
              company: application.company,
              role: application.role,
              jdText: application.jd_text ?? '',
              resume: structuredResume as StructuredResume,
            })
          : buildTailorMessages(context),
        includedCategories: tailorIncludedCategories(context),
        applicationId: application.id,
        accessToken: session?.access_token ?? null,
        signal: controller.signal,
        onToken: (token) => {
          content += token;
          // Free prose streams live; the structured patch is JSON, so we render only the applied
          // result once the stream completes (no raw JSON shown to the user).
          if (!structuredTailor) setOutputs((current) => ({ ...current, [action]: content }));
        },
      });
      if (!content.trim()) throw new Error('The model returned an empty document.');

      // For the résumé action, re-stitch the patch onto the source (the truthfulness guard lives in
      // tailorStructuredResume) → persist the applied StructuredResume as JSON so it re-renders
      // deterministically; show the flattened, readable résumé text in the panel + Copy.
      let persistContent = content;
      if (structuredTailor) {
        const tailored = tailorStructuredResume(structuredResume as StructuredResume, content);
        setTailoredResume(tailored);
        persistContent = JSON.stringify(tailored);
        const readable = flattenResumeText(buildStructuredResumeDocument(tailored)).join('\n');
        setOutputs((current) => ({ ...current, [action]: readable }));
      }

      const artifact = await insertTailorArtifact({
        userId: user.id,
        applicationId: application.id,
        action,
        content: persistContent,
        model: settings.model,
      });
      onArtifactSaved(artifact);
      setStatuses((current) => ({ ...current, [action]: 'saved' }));
      setAuditNote(`${TAILOR_ACTION_LABEL[action]} saved. Its provider call is logged in Privacy.`);

      const next = TAILOR_ACTIONS[TAILOR_ACTIONS.indexOf(action) + 1];
      if (next) {
        requestAction(next, folded);
      } else {
        setActiveTab(resumeReady ? 'tailor' : 'cover');
        setStage('results');
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setFlowError(`${TAILOR_ACTION_LABEL[action]} stopped. Nothing was saved.`);
      } else {
        setFlowError(error instanceof Error ? error.message : 'Generation failed.');
      }
      setStatuses((current) => ({ ...current, [action]: 'idle' }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function copyActiveOutput() {
    const content = outputs[activeTab];
    if (!content) return;
    setCopyNote(null);
    try {
      await navigator.clipboard.writeText(content);
      setCopyNote(`${TAILOR_ACTION_LABEL[activeTab]} copied.`);
    } catch {
      setCopyNote('Copy failed. Select the text and copy it manually.');
    }
  }

  function closeFlow() {
    abortRef.current?.abort();
    onClose();
  }

  const activeContext = pendingAction ? contextFor(pendingAction) : null;
  const preflightManifest = activeContext
    ? buildManifest(tailorIncludedCategories(activeContext))
    : buildManifest([]);
  const streaming = TAILOR_ACTIONS.some((action) => statuses[action] === 'streaming');
  const activeStep = FLOW_STEPS.findIndex((step) => step.stage === stage);

  return (
    <>
      <ModalShell
        title={`Tailor · ${application.company}`}
        onClose={() => pdfOpen ? setPdfOpen(false) : pendingAction ? setPendingAction(null) : closeFlow()}
        contentClassName="max-w-5xl"
      >
        {loading ? (
          <div className="flex min-h-56 items-center justify-center" role="status">
            <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
            <span className="sr-only">Loading tailoring context</span>
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-stage-rejected/30 bg-stage-rejected/10 p-4" role="alert">
            <p className="text-sm text-stage-rejected">{loadError}</p>
            <a href="/profile" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">Open Profile</a>
          </div>
        ) : (
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Tailor flow progress">
              {FLOW_STEPS.map((step, index) => (
                <div key={step.stage} className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                    index <= activeStep ? 'border-accent/30 bg-accent-soft text-accent' : 'border-line bg-surface-2 text-ink-faint'
                  }`}>
                    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-micro ${
                      index < activeStep ? 'bg-accent text-white' : 'border border-current'
                    }`}>{index < activeStep ? <Check className="h-2.5 w-2.5" /> : index + 1}</span>
                    {step.label}
                  </span>
                  {index < FLOW_STEPS.length - 1 && <span className="text-ink-faint">→</span>}
                </div>
              ))}
            </div>

            {stage === 'privacy' && (
              <section className="card overflow-hidden" aria-labelledby="privacy-review-heading">
                <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
                  <span className="rounded-md bg-accent-soft p-2 text-accent"><ShieldCheck className="h-5 w-5" /></span>
                  <div>
                    <Badge tone="eyebrow">Step 1 · Privacy review</Badge>
                    <h3 id="privacy-review-heading" className="mt-2 text-h2 font-semibold text-ink">Approve before anything is sent</h3>
                    <p className="mt-1 text-sm leading-6 text-ink-soft">
                      The kit uses three OpenRouter calls with no-log routing. This is the overall boundary; after the evidence check, each exact call still asks for approval immediately before egress.
                    </p>
                  </div>
                </div>
                <div className="p-5 sm:p-6"><ManifestColumns manifest={KIT_PRIVACY_MANIFEST} /></div>
                <div className="flex flex-col gap-3 border-t border-line-soft bg-surface-2/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p className="max-w-xl text-xs leading-5 text-ink-faint">
                    A manifest + SHA-256 is logged for every call. The payload itself is never stored, and the server writes its audit row before OpenRouter.
                  </p>
                  <div className="flex shrink-0 justify-end gap-2">
                    <Button variant="secondary" onClick={closeFlow}>Cancel</Button>
                    <Button onClick={() => setStage('gaps')}><ShieldCheck className="h-4 w-4" /> Review privacy &amp; continue</Button>
                  </div>
                </div>
              </section>
            )}

            {stage === 'gaps' && (
              <section aria-labelledby="gap-heading">
                <Badge tone="eyebrow">Step 2 · Evidence check</Badge>
                <h3 id="gap-heading" className="mt-3 text-h2 font-semibold text-ink">Confirm only what is true</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
                  The JD asks for skills your profile does not evidence yet. Nothing is claimed automatically—confirmed skills need your evidence; everything else stays a future suggestion.
                </p>

                {gap.gaps.length === 0 ? (
                  <div className="mt-5 rounded-xl border border-stage-offer/30 bg-stage-offer/10 p-4 text-sm text-ink">
                    Your profile evidences every recognized skill in this job description. Unknown prose is never guessed.
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {gap.gaps.map((question) => {
                      const decision = decisions[question.skill];
                      return (
                        <article key={question.skill} className="rounded-xl border border-line-soft bg-surface p-4 shadow-card">
                          <Badge tone="eyebrow">{question.label}</Badge>
                          <p className="mt-2 text-sm leading-6 text-ink-soft">{question.prompt}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button variant={decision?.confirmed ? 'primary' : 'secondary'} size="sm" onClick={() => updateDecision(question.skill, true)}>I have evidence</Button>
                            <Button variant={decision && !decision.confirmed ? 'primary' : 'secondary'} size="sm" onClick={() => updateDecision(question.skill, false)}>Not in my experience</Button>
                          </div>
                          {decision?.confirmed && (
                            <div className="mt-3">
                              <label htmlFor={`evidence-${question.skill}`} className="text-xs font-medium text-ink-soft">What demonstrates {question.label}?</label>
                              <textarea
                                id={`evidence-${question.skill}`}
                                value={decision.evidence}
                                onChange={(event) => updateEvidence(question.skill, event.target.value)}
                                rows={2}
                                className="input mt-1.5 resize-y"
                                placeholder="A concrete project, responsibility, or result—this becomes the evidence behind the claim."
                              />
                            </div>
                          )}
                          {decision && !decision.confirmed && (
                            <p className="mt-3 text-xs text-ink-faint">Kept as a future-growth suggestion only; it will never be presented as experience.</p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-line-soft pt-4">
                  <Button variant="ghost" onClick={() => setStage('privacy')}>Back to privacy review</Button>
                  <Button disabled={!allGapsResolved} onClick={finishGapStep}><Sparkles className="h-4 w-4" /> Generate the kit</Button>
                </div>
              </section>
            )}

            {stage === 'generating' && (
              <section className="card px-5 py-8 text-center sm:px-8 sm:py-10" aria-labelledby="generating-heading">
                <div className="mx-auto inline-flex items-center gap-2.5 text-sm font-semibold text-ink">
                  {streaming ? <LoaderCircle className="h-4 w-4 animate-spin text-accent" /> : <ShieldCheck className="h-4 w-4 text-accent" />}
                  <h3 id="generating-heading">{streaming ? 'Generating your kit…' : `Approve ${TAILOR_ACTION_LABEL[currentAction].toLowerCase()} to continue`}</h3>
                </div>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-soft">
                  {streaming
                    ? `Streaming from ${modelLabel(settings.model)}. Completed documents are saved one at a time.`
                    : 'The stricter privacy rule wins: each required call gets its own exact manifest review before it leaves.'}
                </p>
                <ol className="mx-auto mt-6 grid max-w-2xl gap-2 text-left sm:grid-cols-3" aria-label="Generation status">
                  {TAILOR_ACTIONS.map((action) => {
                    const skipped = action === 'tailor' && !resumeReady;
                    return (
                      <li key={action} className={`rounded-xl border p-3 ${currentAction === action ? 'border-accent/40 bg-accent-soft' : 'border-line-soft bg-surface-2/50'}`}>
                        <p className="text-sm font-semibold text-ink">{TAILOR_ACTION_LABEL[action]}</p>
                        <p className="mt-0.5 text-xs text-ink-soft">{skipped ? 'Skipped · no résumé saved' : ACTION_STATUS_LABEL[statuses[action]]}</p>
                      </li>
                    );
                  })}
                </ol>
                <div className="mx-auto mt-6 max-w-xl space-y-2" aria-hidden="true">
                  <span className="block h-2.5 w-full animate-pulse rounded-full bg-surface-2" />
                  <span className="block h-2.5 w-4/5 animate-pulse rounded-full bg-surface-2" />
                  <span className="block h-2.5 w-11/12 animate-pulse rounded-full bg-surface-2" />
                </div>
                {flowError && <p className="mt-5 text-sm text-stage-rejected" role="alert">{flowError}</p>}
                <div className="mt-5 flex justify-center gap-2">
                  {streaming && <Button variant="secondary" onClick={() => abortRef.current?.abort()}><Square className="h-4 w-4" /> Stop</Button>}
                  {!streaming && flowError && !pendingAction && <Button onClick={() => requestAction(currentAction)}><Sparkles className="h-4 w-4" /> Try again</Button>}
                </div>
              </section>
            )}

            {stage === 'results' && (
              <section aria-labelledby="results-heading">
                <Badge tone="eyebrow">Step 4 · Saved results</Badge>
                <h3 id="results-heading" className="mt-3 text-h2 font-semibold text-ink">Your saved tailoring kit</h3>
                <p className="mt-1 text-sm leading-6 text-ink-soft">Each tab is saved to this application. Review before using it—nothing here should outrun your evidence.</p>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex overflow-x-auto rounded-md border border-line bg-surface-2 p-0.5" role="tablist" aria-label="Saved tailoring results">
                    {TAILOR_ACTIONS.map((action) => (
                      <button
                        key={action}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === action}
                        onClick={() => { setActiveTab(action); setCopyNote(null); }}
                        className={`whitespace-nowrap rounded-sm px-3 py-2 text-xs font-medium transition ${activeTab === action ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
                      >
                        {TAILOR_ACTION_LABEL[action]}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={!outputs[activeTab]} onClick={() => void copyActiveOutput()}><Copy className="h-3.5 w-3.5" /> Copy</Button>
                    <Button size="sm" disabled={!tailoredResume} onClick={() => { setActiveTab('tailor'); setPdfOpen(true); }}><Download className="h-3.5 w-3.5" /> Download PDF</Button>
                  </div>
                </div>

                {activeTab === 'tailor' && !resumeReady ? (
                  <div className="mt-3 rounded-xl border border-line bg-surface p-5 shadow-card" role="tabpanel" aria-label="Tailored résumé result">
                    <h4 className="font-semibold text-ink">Set up your résumé first</h4>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
                      The tailored résumé rewords your confirmed structured résumé toward this role—truthfully, never inventing anything. You haven&apos;t saved one yet, so nothing was sent for the résumé. Your cover letter and interview prep are ready in the other tabs.
                    </p>
                    <a href="/resume" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">Set up your résumé</a>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-line bg-surface p-5 shadow-card" role="tabpanel" aria-label={`${TAILOR_ACTION_LABEL[activeTab]} result`}>
                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-line-soft pb-3">
                      <h4 className="font-semibold text-ink">{TAILOR_ACTION_LABEL[activeTab]}</h4>
                      <span className="inline-flex items-center gap-1.5 text-xs text-stage-offer"><FileCheck2 className="h-3.5 w-3.5" /> Saved</span>
                    </div>
                    <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-ink-soft">{outputs[activeTab]}</div>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-h-5 text-xs text-ink-faint" aria-live="polite">{copyNote ?? auditNote} {auditNote && <a href="/privacy" className="font-medium text-accent hover:underline">Open Privacy</a>}</div>
                  <Button onClick={closeFlow}>Done</Button>
                </div>
              </section>
            )}
          </div>
        )}
      </ModalShell>

      <PreflightModal
        open={pendingAction !== null}
        targetLabel="OpenRouter"
        actionLabel={pendingAction ? TAILOR_ACTION_LABEL[pendingAction] : ''}
        manifest={preflightManifest}
        onApprove={approvePreflight}
        onCancel={() => setPendingAction(null)}
      />
      {pdfOpen && tailoredResume && (
        <StructuredResumePreview resume={tailoredResume} role={application.role} onClose={() => setPdfOpen(false)} />
      )}
    </>
  );
}
