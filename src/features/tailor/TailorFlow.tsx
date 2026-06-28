import {
  CheckCircle2,
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
  TAILOR_ACTIONS,
  TAILOR_ACTION_LABEL,
  TAILOR_PRIVACY_ACTION,
  tailorIncludedCategories,
  type TailorAction,
  type TailorContext,
} from '../../shared/domain/tailor';
import {
  buildManifest,
  preflightKey,
  requiresPreflight,
} from '../../shared/domain/privacy';
import { streamLlm } from '../../shared/lib/llmClient';
import { supabase } from '../../shared/lib/supabase';
import Badge from '../../shared/ui/Badge';
import Button from '../../shared/ui/Button';
import PreflightModal from '../../shared/ui/PreflightModal';
import { useAuth } from '../auth/AuthProvider';
import { ModalShell } from '../tracker/ApplicationForm';
import { DEFAULT_SETTINGS_FORM, settingsToForm } from '../settings/settings';
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

const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  idle: 'Waiting',
  streaming: 'Streaming',
  saved: 'Saved',
};

export default function TailorFlow({ application, onClose, onArtifactSaved }: TailorFlowProps) {
  const { user, session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionDrafts>({});
  const [resolutions, setResolutions] = useState<FoldedResolutions | null>(null);
  const [currentAction, setCurrentAction] = useState<TailorAction>('tailor');
  const [pendingAction, setPendingAction] = useState<TailorAction | null>(null);
  const [approvedKeys, setApprovedKeys] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<Partial<Record<TailorAction, string>>>({});
  const [statuses, setStatuses] = useState<Record<TailorAction, ActionStatus>>({
    tailor: 'idle', cover: 'idle', prep: 'idle',
  });
  const [flowError, setFlowError] = useState<string | null>(null);
  const [auditNote, setAuditNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      supabase.from('profile').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]).then(([profileResult, settingsResult]) => {
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
      }
      setLoading(false);
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [user]);

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
    setDecisions((current) => ({
      ...current,
      [skill]: { confirmed: true, evidence },
    }));
  }

  function finishGapStep() {
    if (!allGapsResolved) return;
    const folded = foldResolutions(gap.gaps.map((question) => resolveGap({
      skill: question.skill,
      confirmed: decisions[question.skill]?.confirmed ?? false,
      evidence: decisions[question.skill]?.evidence,
    })));
    setResolutions(folded);
    requestAction('tailor', folded);
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
        messages: buildTailorMessages(context),
        includedCategories: tailorIncludedCategories(context),
        applicationId: application.id,
        accessToken: session?.access_token ?? null,
        signal: controller.signal,
        onToken: (token) => {
          content += token;
          setOutputs((current) => ({ ...current, [action]: content }));
        },
      });
      if (!content.trim()) throw new Error('The model returned an empty document.');
      const artifact = await insertTailorArtifact({
        userId: user.id,
        applicationId: application.id,
        action,
        content,
        model: settings.model,
      });
      onArtifactSaved(artifact);
      setStatuses((current) => ({ ...current, [action]: 'saved' }));
      setAuditNote(`${TAILOR_ACTION_LABEL[action]} saved. Its provider call is logged in your Privacy log.`);

      const next = TAILOR_ACTIONS[TAILOR_ACTIONS.indexOf(action) + 1];
      if (next) requestAction(next, folded);
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

  function closeFlow() {
    abortRef.current?.abort();
    onClose();
  }

  const activeContext = pendingAction ? contextFor(pendingAction) : null;
  const preflightManifest = activeContext
    ? buildManifest(tailorIncludedCategories(activeContext))
    : buildManifest([]);
  const complete = TAILOR_ACTIONS.every((action) => statuses[action] === 'saved');
  const streaming = TAILOR_ACTIONS.some((action) => statuses[action] === 'streaming');

  return (
    <>
      <ModalShell
        title={`Tailor · ${application.company}`}
        onClose={() => pendingAction ? setPendingAction(null) : closeFlow()}
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
        ) : !resolutions ? (
          <section aria-labelledby="gap-heading">
            <Badge tone="eyebrow">Step 1 · Evidence check</Badge>
            <h3 id="gap-heading" className="mt-3 text-h2 font-semibold text-ink">Before anything is generated</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
              This compares the job description with your profile. Nothing leaves the app until every gap is resolved and you approve the privacy review.
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
                    <article key={question.skill} className="rounded-xl border border-line-soft bg-surface-2/50 p-4">
                      <h4 className="font-semibold text-ink">{question.label}</h4>
                      <p className="mt-1 text-sm leading-6 text-ink-soft">{question.prompt}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant={decision?.confirmed ? 'primary' : 'secondary'} size="sm" onClick={() => updateDecision(question.skill, true)}>
                          I have evidence
                        </Button>
                        <Button variant={decision && !decision.confirmed ? 'primary' : 'secondary'} size="sm" onClick={() => updateDecision(question.skill, false)}>
                          Not in my experience
                        </Button>
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
                            placeholder="A concrete project, responsibility, or result — this becomes the evidence behind the claim."
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

            <div className="mt-5 flex justify-end gap-2 border-t border-line-soft pt-4">
              <Button variant="secondary" onClick={closeFlow}>Cancel</Button>
              <Button disabled={!allGapsResolved} onClick={finishGapStep}>
                <ShieldCheck className="h-4 w-4" /> Continue to privacy review
              </Button>
            </div>
          </section>
        ) : (
          <div className="space-y-5">
            <div>
              <Badge tone="eyebrow">Step 2 · Generate and save</Badge>
              <h3 className="mt-3 text-h2 font-semibold text-ink">One approved call at a time</h3>
              <p className="mt-1 text-sm leading-6 text-ink-soft">
                Each document streams live, is written to this application only after completion, and has its own server-owned privacy audit row.
              </p>
            </div>

            <ol className="grid gap-2 sm:grid-cols-3" aria-label="Tailoring progress">
              {TAILOR_ACTIONS.map((action, index) => (
                <li key={action} className={`rounded-xl border p-3 ${currentAction === action ? 'border-accent bg-accent-soft' : 'border-line-soft bg-surface-2/40'}`}>
                  <p className="text-xs font-medium text-ink-faint">{index + 1}</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{TAILOR_ACTION_LABEL[action]}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{ACTION_STATUS_LABEL[statuses[action]]}</p>
                </li>
              ))}
            </ol>

            <div className="space-y-3">
              {TAILOR_ACTIONS.map((action) => outputs[action] !== undefined && (
                <section key={action} className="rounded-xl border border-line-soft bg-surface-2/40 p-4" aria-label={`${TAILOR_ACTION_LABEL[action]} output`}>
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-ink">{TAILOR_ACTION_LABEL[action]}</h4>
                    {statuses[action] === 'streaming' ? <LoaderCircle className="h-4 w-4 animate-spin text-accent" /> : <FileCheck2 className="h-4 w-4 text-stage-offer" />}
                  </div>
                  <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-ink">
                    {outputs[action] || <span className="text-ink-faint">Waiting for the first token…</span>}
                  </div>
                </section>
              ))}
            </div>

            <div className="min-h-5" aria-live="polite">
              {flowError && <p className="text-sm text-stage-rejected" role="alert">{flowError}</p>}
              {auditNote && <p className="text-sm text-ink-soft">{auditNote} <a href="/privacy" className="font-medium text-accent hover:underline">Open Privacy log</a></p>}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
              {streaming && (
                <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                  <Square className="h-4 w-4" /> Stop
                </Button>
              )}
              {!streaming && !complete && !pendingAction && (
                <Button onClick={() => requestAction(currentAction)}>
                  <Sparkles className="h-4 w-4" /> Review & generate {TAILOR_ACTION_LABEL[currentAction]}
                </Button>
              )}
              {complete && (
                <Button onClick={closeFlow}><CheckCircle2 className="h-4 w-4" /> Done</Button>
              )}
            </div>
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
    </>
  );
}
